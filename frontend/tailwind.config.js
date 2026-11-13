/** @type {import('tailwindcss').Config} */
export default {
  content:['./index.html','./src/**/*.{ts,tsx}'],
  theme:{colors:{sage:'#9CAF88',offwhite:'#F7F5EF',tomato:'#EB412C',transparent:'transparent',current:'currentColor'},extend:{fontFamily:{display:['Georgia','serif'],sans:['Inter','system-ui','sans-serif'],mono:['ui-monospace','monospace']},borderRadius:{'4xl':'2rem'}}},
  plugins:[]
};
