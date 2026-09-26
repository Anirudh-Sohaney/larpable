# In-app applications

Applications are stored in `applications.json` through `backend/store.js`. The file is created on first application; no manual data migration is required. It contains only user IDs and timestamps, so applicant contact details remain in the existing encrypted user records.

```json
{
  "opp_id": {
    "usr_applicant_id": {
      "applied_at": "2026-09-25T12:00:00.000Z",
      "read_at": null
    }
  }
}
```

`POST /api/opportunities/:id/applications` requires a signed-in user, rejects the post owner, and uses a serialized store update to create one record per user and post. Repeated requests return the existing application. Flagged and missing posts do not accept applications.

The opportunity detail API returns the current user's `applied` state. Only the owner receives the count and unread state. The feed exposes application counts and notification timestamps only for the owner's own posts. `GET /api/opportunities/:id/applications` returns the owner's applicant list, populated from current user profiles. `POST /api/opportunities/:id/applications/seen` marks only the IDs displayed to the owner as read, so a new application arriving while the list loads stays unread.

Deleting an opportunity removes its application bucket. Account deletion removes that user's applications and all buckets for posts they owned. Staff deletion paths do the same.
