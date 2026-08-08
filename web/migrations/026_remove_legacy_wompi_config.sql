-- Elimina la configuración pública de la pasarela que ya no se utilizará.
DELETE FROM site_config WHERE key = 'wompi_public_key';

