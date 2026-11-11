-- Migration original: apagava todas as visitas e noticias (limpeza dos dados
-- gerados pelas execucoes de verificacao no ambiente de desenvolvimento).
-- Reescrita para nunca apagar dado real: so remove as linhas de teste,
-- identificadas pela origem. Em um ambiente novo ela nao faz nada.
DELETE FROM public.visitas WHERE path = '/teste-automated';
DELETE FROM public.noticias WHERE fonte = 'Q GRÃOS — teste interno';
DELETE FROM public.leads WHERE email IN ('teste@qgraos.invalid', 'teste@exemplo.com.br');
