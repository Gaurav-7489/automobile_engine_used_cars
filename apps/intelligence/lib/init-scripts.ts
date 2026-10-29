// Plain strings (no "use client") so the server layout can inline them before first paint.
export const THEME_KEY = "vl-theme";
export const MOTION_KEY = "vl-motion";
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
export const MOTION_INIT_SCRIPT = `try{var m=localStorage.getItem("${MOTION_KEY}");if(m==="reduced"||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.setAttribute("data-motion","reduced")}catch(e){}`;
