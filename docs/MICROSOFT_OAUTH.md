# Microsoft OAuth 2.0 / Outlook Calendar

MeliApp utilise **uniquement un flux utilisateur délégué** pour Outlook Calendar.

## Contrat de sécurité

- Application Microsoft Entra de type **Single-page application (SPA)**.
- OAuth 2.0 Authorization Code Flow avec **PKCE**.
- Client public : **aucun `client_secret`** dans MeliApp.
- Appels Graph via `/me/...`, donc toujours au nom de l’utilisateur connecté.
- Permission Graph : **Delegated `Calendars.ReadWrite` et `MailboxSettings.Read`**.
- Aucune permission Microsoft Graph de type **Application** n’est nécessaire ni acceptée par l’architecture MeliApp.
- Scopes OIDC : `openid`, `profile`, `offline_access`.
- Tenant par défaut : `common`, afin d’accepter les comptes Microsoft personnels et professionnels autorisés par l’enregistrement Entra.

## Configuration Entra une seule fois par le déployeur

1. Créer une App Registration Microsoft Entra pour MeliApp.
2. Dans **Authentication**, ajouter une plateforme **Single-page application**.
3. Ajouter exactement l’URL GitHub Pages de MeliApp comme Redirect URI, par exemple :
   `https://<compte>.github.io/MeliApp/`
4. Dans **API permissions**, ajouter Microsoft Graph → **Delegated permissions** → `Calendars.ReadWrite` et `MailboxSettings.Read`.
5. Ne pas ajouter `Calendars.ReadWrite` en Application permission.
6. Ne pas créer de secret client pour le frontend.
7. Copier l’Application (client) ID public dans la configuration de déploiement :

```html
<script>
  window.MELIAPP_CONFIG = {
    microsoftClientId: "APPLICATION_CLIENT_ID",
    microsoftTenant: "common"
  };
</script>
```

Ce bloc doit être injecté avant `js/main.js`, ou le `clientId` peut être renseigné par le mécanisme de déploiement choisi. Il ne s’agit pas d’un secret.

## Flux utilisateur

```text
Utilisateur
   ↓
Connecter mon calendrier Outlook
   ↓
Microsoft authorize /oauth2/v2.0/authorize
   ↓
Consentement Calendars.ReadWrite délégué
   ↓
Code OAuth
   ↓
PKCE verifier
   ↓
Token délégué
   ↓
Microsoft Graph /me/calendarView et /me/events
```

Le token donne à MeliApp uniquement les droits accordés par l’utilisateur et par son organisation Microsoft. Une politique d’entreprise peut donc refuser le consentement, ce qui doit être présenté comme une indisponibilité de connexion et non comme une erreur à corriger par l’utilisateur.

## Données et stockage

Les access tokens et refresh tokens sont conservés en `sessionStorage` dans l’implémentation actuelle. Ils ne doivent jamais être exportés dans les données MeliApp, inscrits dans IndexedDB, loggés ou committés.

## Couleurs des catégories

Les événements incluent leurs noms de catégories. MeliApp lit `/me/outlook/masterCategories` avec la permission déléguée en lecture seule `MailboxSettings.Read` pour retrouver les couleurs Outlook (`preset0` à `preset24`). Les comptes déjà connectés doivent se reconnecter et accepter cette permission supplémentaire. Si la lecture des catégories est refusée, les rendez-vous restent disponibles et un message explique pourquoi les couleurs manquent. Pour plusieurs catégories, la première catégorie dont la couleur est connue détermine la couleur du bloc ; tous les noms sont présents dans les détails. Les teintes correspondent à la palette Outlook ; leur rendu peut différer selon le thème du client Outlook.

## Sélection des agendas

MeliApp récupère la liste paginée avec `/me/calendars`, puis les événements de chaque agenda coché avec `/me/calendars/{id}/calendarView`. Le sélecteur propose les agendas accessibles renvoyés par Microsoft Graph pour ce compte ; il ne contourne pas les restrictions sur les agendas partagés ou d’organisation. Tous les agendas sont cochés par défaut. Le choix est conservé dans l’état local, et une sélection vide n’entraîne aucun chargement d’événements. Le nom de l’agenda source apparaît dans les détails des rendez-vous.
