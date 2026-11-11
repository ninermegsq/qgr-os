INSERT INTO public.noticias (titulo, resumo, categoria, fonte, url, publicado, destaque, publicado_em)
VALUES
('Safra de graos cresce e pressiona o frete', 'Resumo de teste 1 do agronegocio.', 'Safra', 'Teste Q GRAOS', 'https://exemplo.test/1', true, true, now() - interval '1 day'),
('Preco do milho sobe no mercado de Mato Grosso', 'Resumo de teste 2 do agronegocio.', 'Mercado', 'Teste Q GRAOS', 'https://exemplo.test/2', true, false, now() - interval '2 days'),
('Logistica do agro ganha eficiencia no centro-oeste', 'Resumo de teste 3 do agronegocio.', 'Logistica', 'Teste Q GRAOS', 'https://exemplo.test/3', true, false, now() - interval '3 days'),
('Safra de soja exige novo planejamento de frete', 'Resumo de teste 4 do agronegocio.', 'Safra', 'Teste Q GRAOS', 'https://exemplo.test/4', true, false, now() - interval '4 days'),
('Expedientes de carga mudam no periodo de safra', 'Resumo de teste 5 do agronegocio.', 'Logistica', 'Teste Q GRAOS', 'https://exemplo.test/5', true, false, now() - interval '5 days'),
('Corretagem compra certificacao de estoque', 'Resumo de teste 6 do agronegocio.', 'Mercado', 'Teste Q GRAOS', 'https://exemplo.test/6', true, false, now() - interval '6 days'),
('Agenciamento de cargas ganha contrato no norte', 'Resumo de teste 7 do agronegocio.', 'Logistica', 'Teste Q GRAOS', 'https://exemplo.test/7', true, false, now() - interval '7 days'),
('MDF-e simplifica documento para o produtor', 'Resumo de teste 8 do agronegocio.', 'Geral', 'Teste Q GRAOS', 'https://exemplo.test/8', true, false, now() - interval '8 days'),
('Investidores revisam plano de safra 2026/27', 'Resumo de teste 9 do agronegocio.', 'Safra', 'Teste Q GRAOS', 'https://exemplo.test/9', true, false, now() - interval '9 days'),
('Embarque de graos usa nova rota fluvial', 'Resumo de teste 10 do agronegocio.', 'Exportacao', 'Teste Q GRAOS', 'https://exemplo.test/10', true, false, now() - interval '10 days');
