# Spotify OAuth dans MeliApp

MeliApp est une PWA statique et utilise OAuth 2.0 Authorization Code avec PKCE.

## Valeur nécessaire

Le déploiement a besoin du **Client ID public** de l'application Spotify dans le secret d'environnement GitHub Pages :

`SPOTIFY_CLIENTID`

Le **Client Secret Spotify n'est pas utilisé** et ne doit jamais être injecté dans le JavaScript servi par GitHub Pages.

Si un secret GitHub nommé `SPOTIFY_SECRET` contient le vrai Client Secret Spotify, il doit rester inutilisé côté navigateur. Si le Client ID public a été enregistré par erreur sous ce nom, recrée simplement un secret `SPOTIFY_CLIENTID` avec cette valeur publique.

Redirect URI attendue :

`https://cypt71.github.io/MeliApp/`

Scopes utilisateur demandés :

- `user-read-playback-state`
- `user-modify-playback-state`
- `playlist-read-private`
- `user-library-read`
