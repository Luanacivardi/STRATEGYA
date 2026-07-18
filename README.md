# STRATEGYA — by ORBEEX

Software proprietário de gestão estratégica, conformidade e resultados.
Copyright (c) ORBEEX. Todos os direitos reservados. Veja [LICENSE.md](LICENSE.md).

## Build de produção (ofuscado)

O código em `js/` é a fonte de desenvolvimento (legível). Para publicar, gera-se
uma versão ofuscada em `dist/`, que é o que deve ser servido para os usuários:

```
npm install
npm run build
```

Isso cria `dist/` com os arquivos JS ofuscados (nomes/lógica embaralhados,
strings codificadas) e um aviso de copyright/fingerprint de build no topo de
cada arquivo. `index.html`, `css/`, `CNAME` e demais estáticos são copiados
sem alteração.

**Importante:** publique/deploy sempre a partir de `dist/`, nunca do `js/` bruto.
