import { route } from "rwsdk/router";
import { LoginPage } from "./LoginPage";
import SignupPage from "./SignupPage";
import RequestPasswordResetPage from "./RequestPasswordReset";
import ResetPasswordPage from "./ResetPassword";
import WidgetSuccessPage from "../widgetSuccess/WidgetSuccessPage";

export const userRoutes = [
  route("/login", LoginPage),
  route("/login/widget-success", WidgetSuccessPage),
  route("/logout", async function ({ request }) {
    const { initAuth } = await import("@/lib/auth");
    // Call Better Auth sign-out to clear the session cookie
    const signOutRequest = new Request(
      new URL("/api/auth/sign-out", request.url),
      { method: "POST", headers: request.headers }
    );
    await initAuth().handler(signOutRequest);
    
    // Redirect to main domain login
    const url = new URL(request.url);
    const PRIMARY_DOMAIN = url.hostname.includes("localhost")
      ? `${url.protocol}//localhost:${url.port || 5173}`
      : `${url.protocol}//qlave.dev`;
    
    return new Response(null, {
      status: 302,
      headers: { Location: `${PRIMARY_DOMAIN}/user/login` },
    });
  }),
  route("/signup", SignupPage),
  route("/forgot-password", RequestPasswordResetPage),
  route("/reset-password", ResetPasswordPage),
];