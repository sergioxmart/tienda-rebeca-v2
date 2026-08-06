// Entry point de la tienda pública.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SiteProvider } from './site/SiteContext.jsx';
import { CartProvider } from './cart/CartContext.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SiteProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </SiteProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
