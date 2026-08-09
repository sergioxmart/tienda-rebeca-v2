// Entry point de la tienda pública.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SiteProvider } from './site/SiteContext.jsx';
import { CartProvider } from './cart/CartContext.jsx';
import { BuilderPreviewProvider } from './preview/BuilderPreviewContext.jsx';
import { PageModulesProvider } from './modules/PageModulesContext.jsx';
import { CustomerProvider } from './customer/CustomerContext.jsx';
import { ColombiaLocationsProvider } from './locations/ColombiaLocationsContext.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <BuilderPreviewProvider>
        <SiteProvider>
          <PageModulesProvider>
            <CartProvider>
            <ColombiaLocationsProvider>
              <CustomerProvider>
                <App />
              </CustomerProvider>
            </ColombiaLocationsProvider>
            </CartProvider>
          </PageModulesProvider>
        </SiteProvider>
      </BuilderPreviewProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
