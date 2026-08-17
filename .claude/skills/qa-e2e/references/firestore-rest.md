# Firestore REST for QA seeding & cleanup

Sign in (returns idToken valid ~1h). The web API key is public (it's in the
site bundle); the password comes from the owner / QA_ADMIN_PASSWORD:

```
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<WEB_API_KEY>
{"email":"webadmin@fibernorth.com","password":"<...>","returnSecureToken":true}
```

List / delete (base = https://firestore.googleapis.com/v1/projects/fn-underground/databases/(default)/documents):

```
GET  {base}/quoteRequests?pageSize=50          Authorization: Bearer <idToken>
DELETE https://firestore.googleapis.com/v1/<doc.name>   (doc.name from the list response)
```

Create (values use Firestore typed encoding — stringValue/booleanValue/arrayValue):

```
POST {base}/blog   body: {"fields": {"title": {"stringValue": "..."}, ...}}
```

Rules: the deployed security rules allow these operations only for allowlisted
admin accounts. ALWAYS filter deletes to docs whose `name` field starts with
"QA-TEST" — never touch real customer records. Verify cleanup with a final
list call.
