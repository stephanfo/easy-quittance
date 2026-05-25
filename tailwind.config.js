import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        apple: {
          blue: '#0071e3',
          'blue-hover': '#0077ed',
          text: '#1d1d1f',
          // muted était #6e6e73 (~4.5:1 sur bg-apple-bg, en dessous WCAG AAA).
          // #5b5b60 → ~5.5:1 sur bg-apple-bg, ~5.9:1 sur blanc — AAA "large text" et confortable
          // pour le corps muted (texte secondaire des cartes).
          muted: '#5b5b60',
          bg: '#f5f5f7',
          // border décorative, contraste non critique.
          border: '#d2d2d7',
          danger: '#ff3b30',
          'danger-hover': '#ff453a',
          success: '#00c853',
          'success-bg': '#d1f4e0',
          warning: '#ff9800',
        },
      },
      fontFamily: {
        system: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [forms],
};
