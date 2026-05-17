import Alpine from 'alpinejs';
import { appData } from './app.js';
import './style.css';

Alpine.data('app', appData);
window.Alpine = Alpine;
Alpine.start();
