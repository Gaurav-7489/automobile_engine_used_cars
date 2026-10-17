export const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);export const number=(n:number)=>new Intl.NumberFormat("en-IN").format(n);
const lakhDigits=new Intl.NumberFormat("en-IN",{maximumFractionDigits:2});
/** Indian buyer notation: ₹8.5 lakh, ₹1.2 crore. */
export const rupees=(n:number)=>n>=1e7?`₹${lakhDigits.format(n/1e7)} crore`:n>=1e5?`₹${lakhDigits.format(n/1e5)} lakh`:`₹${number(n)}`;
