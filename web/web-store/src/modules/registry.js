// Registry de renderers para page_modules.
//
// Cada entry mapea un `type` a un componente React. El componente recibe
// el módulo entero ({ id, type, settings, position }) y devuelve JSX.
//
// Cuando agregues un type nuevo en el backend, tenés que:
//   - Agregarlo a MODULE_TYPES en web/server/routes/admin/page-modules.js
//   - Agregarlo a MODULE_SCHEMAS en web/web-admin/src/pages/PageBuilder.jsx
//   - Importar y exportar el renderer ACÁ

import Hero from './Hero.jsx';
import Banner from './Banner.jsx';
import Categories from './Categories.jsx';
import CategoriesGrid from './CategoriesGrid.jsx';
import Carousel from './Carousel.jsx';
import Collections from './Collections.jsx';
import Text from './Text.jsx';
import Contact from './Contact.jsx';
import FeaturedProducts from './FeaturedProducts.jsx';
import RecentProducts from './RecentProducts.jsx';
import Footer from '../components/Footer.jsx';

export const MODULE_RENDERERS = {
  hero:              Hero,
  banner:            Banner,
  categories:        Categories,
  categories_grid:   CategoriesGrid,
  carousel:          Carousel,
  collections:       Collections,
  text:              Text,
  contact:           Contact,
  featured_products: FeaturedProducts,
  recent_products:   RecentProducts,
  footer:            Footer,
};
