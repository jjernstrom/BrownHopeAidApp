/**
 * This file contains the configuration for the login form
 * on /login. This includes
 *    - Fields used to login
 *    - Buttons on page
 *    - Header text
 */

import axios from "axios";
import { routes } from "../util/config";
import { IForm, IFields, IButtons } from "./inputUtil";


export const fields: IFields[] = [
  {
    label: "Username",
    id: "username",
    type: "textbox",
    value: "",
  },
  {
    label: "Password",
    id: "password",
    type: "password",
    value: "",
  },
]


export const buttons: IButtons[] = [
  {
    text: "Login",
    type: "submit",
    bootstrapClass: "btn btn-success"
  },
  {
    text: "Create An Account",
    to: "/sign-up",
    bootstrapClass: "btn btn-secondary"
  }
]

export const sendLoginRequest = async (form: IFields[], afterSubmit:Function) => {
  try {
    const resp = await axios.post(routes.login, LoginFormToHttpBody(form), { withCredentials: true });
    console.log(resp.data);
    if (resp.data === "Success") {
      sessionStorage.setItem('username', form[0].value);
      window.location.reload()
    } else if (resp.data === "Failed") {
      alert("Sorry, wrong username or password. Please try again!")
    }
  } catch (err) {
    // Handle Error Here
    console.error(err);
    alert("Login Failed");
  }
};




export const header = "Login to your account"

// This function is used to format the request sent to the
// back end
export const LoginFormToHttpBody = (form: IFields[]) => {
  return {
    username: form[0].value,
    password: form[1].value,
  }
}

export const form: IForm =
{
  fields: fields,
  buttons: buttons,
  submit: sendLoginRequest,
}