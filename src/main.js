import Alpine from 'alpinejs';
import { appData } from './app.js';
import { setupServiceWorker, setupInstallPrompt } from './lib/pwa.js';
import './style.css';

Alpine.data('app', appData);
window.Alpine = Alpine;
Alpine.start();

setupServiceWorker();
setupInstallPrompt();
