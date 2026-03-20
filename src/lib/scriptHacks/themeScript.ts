// @/lib/scriptHacks/themeScript.ts

export function themeScriptFn() {
    try {
      const theme    = localStorage.getItem("qlave-theme");
      const system   = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const resolved = theme === "light" ? "light" : theme === "dark" ? "dark" : system;
      document.documentElement.setAttribute("data-theme", resolved);
      // Block transitions until after first paint
      document.documentElement.style.setProperty("--transition-override", "none");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.style.removeProperty("--transition-override");
        });
      });
    } catch {}
}
  
export const themeScriptContent = `(${themeScriptFn.toString()})()`;