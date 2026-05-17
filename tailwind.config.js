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
          muted: '#6e6e73',
          bg: '#f5f5f7',
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
