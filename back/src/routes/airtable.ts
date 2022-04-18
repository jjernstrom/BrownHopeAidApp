require('dotenv').config();
import { response, Router } from 'express';
import passport from 'passport';
import airtable from 'airtable';
import * as local from 'passport-local';
import bcrypt from 'bcrypt';
import async from 'async';
import nodemailer from 'nodemailer';

const localStrategy = local.Strategy;
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.BASE_ID;
const base = new airtable({apiKey: airtableApiKey}).base(baseId);
const airtableRouter = Router();


airtableRouter.get('/', (req, res, next) => {
    res.sendStatus(200)
})


airtableRouter.post('/login', function(req, res, next) {
    passport.authenticate('local', function(error, user, info) {
      if(error) {
          console.log("Error: " + error);
      } else if (!user) {
          // invalid username or password
          console.log(info.message);
          res.send("Failed")
      } else {
          req.login(user, function(err) {
              if (err) { return next(err); }
              console.log("Successfully logged in");
              res.send("Success")
            });
      }
    })(req, res, next);
  });

airtableRouter.post('/application_status', (req, res, next) => {
    //console.log('what is this ' + JSON.stringify(req.body))
    const passphrase = req.body.passphrase;
    
    let get_record_id = new Promise((resolve,reject) => {
        let record_idx = null;
        
        base('Human Readable Passphrases').select({
            maxRecords: 1,
            view: "Grid view"
        }).eachPage(function page(records, fetchNextPage){
            records.forEach(function(record){
                if(record.get('Passphrase') == passphrase){
                    record_idx = record.get('FR Record ID')
                    console.log("record id: " + record_idx)
                }
            })
    
            fetchNextPage();
    
        }, function done(err){
            if(err) {console.log(err); return}
            resolve(record_idx)
        });
        


    })

    get_record_id
    .then((record_idx)=>{
      
        base('2021 Form Responses').select({filterByFormula: `{BRF 2021 Application Record ID} = '${record_idx}'`}).firstPage((err, records)=>{

            if(err){
                console.log("error: " + err);
                res.sendStatus(404)
                return;
            }else if (records.length == 1){
                console.log(records[0].fields['BRF Application Stage']);
                console.log("what is this: " + JSON.stringify(records))
                res.send(records[0].fields['BRF Application Stage']);  
            }else{
                console.log("error either too many records, or no record found")
                res.sendStatus(404);
            }
             
        })
       
    })
     
})

airtableRouter.get("/isLoggedIn", function (req, res, next) {
  if (req.user) {
    res.send(req.user);
  } else {
    res.send("False");
  }
});

airtableRouter.post('/signout', function(req, res, next) {
  req.logout();
  res.send("Success");
});


airtableRouter.post("/getInfo", function (req, res) {
  console.log(JSON.stringify(req.body[0]))
  if(req.body[0].userName == undefined){
    res.end();
    return;
  }
  try {
    
    const userName = req.body.userName;
  
    const fields = {
      firstName: "",
      lastName: "",
      phoneNumber: "",
      address: "",
      emailAddress: "",
      contactMethod: "",
      paymentMethod: "",
    };
    console.log("what is the req.body: " + JSON.stringify(req.body))
    base("Authentication")
      .select({ filterByFormula: `{Username} = "${userName}"` })
      .firstPage((err, records) => {
        if (err) console.error(err);
        if (records.length != 1)
          res.status(401).send({ error: "No such user exists" });
        const recordID = records[0].fields["User Data Record ID"];
        console.log("record Id " + recordID);
        console.log("what is it though: " + records)
        base('User Data')
        .find(recordID, (err, record) => {
          console.log("what is the name " + JSON.stringify(fields));
          console.log("done with that");

          console.log('what is the record id: ' + JSON.stringify(record))
          if(record.fields['Full Name'] != " "){
            console.log("this is running?")
            var fullName = record.fields["Full Name"]
            fields.firstName = fullName.split(" ")[0]
            fields.lastName = fullName.split(" ")[1]
            fields.phoneNumber = record.fields["Phone Number"];
            fields.address = record.fields["Mailing Address"];
            fields.emailAddress = record.fields["Email Address"];
            fields.contactMethod = record.fields["Preferred Contact Method"];
            //fields.paymentMethod = records[0].fields["Funding Preference"];
            console.log("fields: " + JSON.stringify(fields))
            res.write(JSON.stringify(fields));
            
          }else {
            res.write(JSON.stringify(null));
          }
          res.end();
            
        });
        
    });
  } catch (err) {
    console.error(err);
    res.end();
    throw err;
  }
});



airtableRouter.post('/signup', function(req, res, next) {
  const username = req.body.username;
  const email = req.body.email;
  const password = req.body.password;
  async.waterfall ([
    // hash the new user password
    function(done) {
      console.log("Hashing new user password");
      bcrypt.hash(password, Number(process.env.SALT), function(err, hash) {
        if (err) {
          console.error(err);
          done(err);
        }
        else {
          console.log("Success");
          console.log(hash);
          done(err, hash);
        }
      });
    },
    // make sure the user does not already exist
    function(hashed_pw, done) {
      console.log(hashed_pw);
      base('Authentication').select({filterByFormula: `Username = "${username}"`}).firstPage((err, records) => {
        if (err) {
          console.error(err);
        }
        else if (records.length == 0) {
          console.log("Create new user...");
          done(err, hashed_pw, true);
        }
        else {
          console.log("User already exists");
          done(err, hashed_pw, false);
        }
      });
    },
    // create the new user record in users table and return the record_id
    function(hashed_pw, do_signup, done) {
      if (do_signup == false) {
        done(null, false, null);
      }
      else{
        base('Authentication').create([
          {
            "fields": {
              "Username": username,
              "Password": hashed_pw,
            }
          }
        ], function(err, record_new){
          if (err) {
            console.error(err);
            done(err, false, null);
          }
          else {
            console.log("Success")
            console.log("Record Id: " + record_new[0].getId())
            done(err, do_signup, record_new[0].getId());
          }
        });
      }
    },
    // ensure that the record does not already exist
    function(do_signup, record_id, done) {
      if (do_signup == false) {
        done(null, do_signup, record_id, null);
      }
      else {
        base("User Data").select({filterByFormula: `{Email Address} = "${email}"`}).firstPage((err, records) => {
          if (err) {
            console.error(err);
            done(err, false, null, null, null);
          }
          else if (records.length > 0) {
            console.log("Email Exists in User Data Already");
            done(err, do_signup, record_id, records[0].getId(), records[0].fields.Name);
          }
          else {
            console.log("Create New Form Responses Record");
            done(err, do_signup, record_id, null, null);
          }
        });
      }
    },
    // associate the record id to the Form Responses table
    function(do_signup, record_id, fr_record_id, name, done) {
      if (do_signup == false ) {
        done(null, do_signup, null, null);
      }
      // There is not a record in the Form Respnonses table already,
      // create a new record with the record id from the users table
      else if (fr_record_id == null) {
        console.log("Associating Record ID " + record_id)
        
        base('User Data').create([
          {
            fields: {
              "Email Address" : email
            }
          }
        ], function(err, record_new) {
          if(err) {
            console.error(err);
            done(err, false, null, null);
          }
          else {
            console.log("this is the record id: " + record_new[0].getId())

            base('Authentication').update([{'id': record_id, 'fields': {'User Data Record ID': record_new[0].getId()},}], function(err, update_record) {
              if (err) {
                console.error(err)
              };
          
              // redirect user to logged in page? or somewhere?
              
            })
            done(err, do_signup, null, null);
          }
        });
      }
      // The user had information entered in the Form Responses table already
      // but did not have an online account. Update the email address and 
      // record id to reflect the appropriate user
      else {
        const token = record_id.substring(3, record_id.length) 
                      + '-' 
                      + fr_record_id.substring(3, fr_record_id.length);
        done(null, do_signup, token, name);
      }
    },
    // Report back to front end!
    

    function(do_signup, token, name, done) {
      if(do_signup) {
        if (token == null) {
          console.log("Send success message");
          res.send("Success");
        }
        else {
          console.log("Send email")
          console.log("Create SMTP Transport")
          const smtpTransport = nodemailer.createTransport({
            // host: "smtp.mailtrap.io",
            // port: 2525,
            service: 'gmail',
            auth: {
              user: process.env.NOREPLY_EMAIL,
              pass: process.env.NOREPLY_PASS
            }
          });
          const mail_info = {
            to: email,
            from: process.env.NOREPLY_EMAIL,
            subject: process.env.RESET_SUBJECT,
            text: 'Hello ' + name + ','
                  + '\n\n' 
                  + 'You are receiving this email because you are attempting '
                  + 'to create an account on our app to manage your existing '
                  + 'profile in our system. To claim your account, please use '
                  + 'the link below and enter your password to verify that it '
                  + 'is you. Once you have claimed your account you will be '
                  + 'able to log in with the username you proviced: '
                  + username + '.'
                  + '\n\n' 
                  + 'http://' + process.env.RESET_SERVER + '/signup/verify/' + token 
                  + '\n\n' + 'If you did not request this, please ignore this email.'
                  + '\n\n'
                  + 'Thank you,\n'
                  + 'The BRF Team'
          };
          smtpTransport.sendMail(mail_info,)
          res.send("Emailed")
        }
        done(null);
      }
      else {
        console.log("Send failed message");
        res.send("Failed");
        done(null);
      }
    }
  ], function(err) {
    if (err) {
      console.error(err);
      res.send("Failed");
    }
  });
});



airtableRouter.post('/update_password', function(req, res, next) {
  const username =  req.user[0].fields.Username;
  const old_password = req.body.old_password;
  const new_password = req.body.new_password;
  const new_password_verify = req.body.new_password_verify;
  
  // get user
  base('Authentication').select({filterByFormula: `Username = "${username}"`}).firstPage((err, records) => {
    if (err) {
      console.error(err)
    };
    if (records.length == 0 || records.length > 1) {
      console.log("User Does Not Exist")
      res.send("Failed")
    };
    // get record id and old password hash from user records
    const record_id = records[0].getId()
    const hashed_password = records[0].fields.Password
    // compare input old password to current password
    bcrypt.compare(old_password, hashed_password, function(err, hash_res) {
      if (err) {
        console.error(err)
      }
      else if (hash_res) {
        // old password is a match, hash and compare new password
        // before assigning
        bcrypt.hash(new_password, 10, function(err, hash) {
          // compare both entries for new password to ensure no user typos
          bcrypt.compare(new_password_verify, hash, function(err, res_verify) {
            if (err) {
              console.error(err)
            }
            else if (res_verify) {
              // both new passwords match, new password hashed, update user password
              base('Authentication').update([{'id': record_id, 'fields': {'Password': hash},}], function(err, update_record) {
                if (err) {
                  console.error(err)
                };
                console.log("New Password Updated")
                res.send("Success")
                // redirect user to logged in page? or somewhere?
              })
            }
            else {
              console.log("New passwords do not match each other")
              res.send("Failed")
            }
          })
        })
      }
      else {
        console.log("Old Password does not match")
        res.send("Failed")
      }
    })
  });
});

airtableRouter.post("/update", function (req, res) {
  

  console.log("what is this: " + JSON.stringify(req.body[0].value));
  
  try {
    const fields = {
      "First Name": "",
      "Last Name": "",
      "Phone Number": "",
      "Mailing Address": "",
      "Email Address": "",
      "Preferred Contact Method": "",
     
    };
    let {
      userName,
      firstName,
      lastName,
      ...fieldsToChange
    } = req.body.reduce(
      (acc, field) => ({ [field.name]: field.value, ...acc }),
      {}
    );
    console.log("what is first: " + firstName)
    console.log('what is last: ' + lastName)

    console.log("even though this is empty: " + JSON.stringify(fieldsToChange));
    fieldsToChange.Name = `${firstName} ${lastName}`;
    console.log("splitting hairs: " + fieldsToChange.Name.split(' ')[0]);
    fieldsToChange.firstName = `${firstName}`;
    fieldsToChange.lastName = `${lastName}`;
    for (const field in fieldsToChange) {
      switch (field) {
        case "firstName":
          fields["First Name"] = fieldsToChange[field];
          break;
        case "lastName":
          fields["Last Name"] = fieldsToChange[field];
          break;
        case "address":
          fields["Mailing Address"] = fieldsToChange[field];
          break;
        case "phoneNumber":
          fields["Phone Number"] = fieldsToChange[field];
          break;
        case "emailAddress":
          fields["Email Address"] = fieldsToChange[field];
          break;
        case "contactMethod":
          fields["Preferred Contact Method"] = fieldsToChange[field];
          break;
      }
    }
    console.log("what is the name " + userName);
  
    base("Authentication")
    .select({ filterByFormula: `{Username} = "${userName}"` })
    .firstPage((err, records) => {
      
      if (err) console.error(err);
   
      if (records.length != 1)
        return res.status(403).send({ error: "Unauthorized user" });
      
      const recordID = records[0].fields["User Data Record ID"];
     
      base('User Data')
      .find(recordID, (err, record) => {
        console.log("what is the name " + JSON.stringify(fields));
        console.log("done with that");

        console.log('what is the record id: ' + recordID)
        
        base("User Data").update([
          {
            "id": recordID.toString(),
            "fields": fields
          }

        ], function(err, records){
          if(err){
            console.error(err);
            return;
          }
          console.log("were not fucked yet")

        });


      })
      });
  } catch (err) {
   
    console.log(err);
    throw err;
  }
});



passport.serializeUser(function(user, callback) {
    callback(null, user);
  });
  
passport.deserializeUser(function(user, callback) {
callback(null, user);
});


passport.use(
    new localStrategy(
      { usernameField: "username", passwordField: "password" },
      function (username, password, done) {
        base("Authentication")
          .select({ filterByFormula: `Username = "${username}"` })
          .firstPage((err, records) => {
            if (err) {
              return done(null, false, {
                message: "Could not connect to Airtable",
              });
            }
            if (records.length == 0 || records.length > 1) {
              return done(null, false, { message: "User not found" });
            }
            bcrypt.compare(
              password,
              records[0].fields.Password,
              function (err, res) {
                if (err) {
                  console.log("There was an error validating the password");
                  return done(err);
                } else if (res) {
                  // successful match
                  return done(null, records);
                } else {
                  // bad password
                  return done(null, false, { message: "Incorrect Password" });
                }
              }
            );
          });
      }
    )
  );

export default airtableRouter;