# Security Specification - Noordzee Surf Advies

## Data Invariants
1. **User Profiles**: A user can only read and write their own profile.
2. **Shared Spots**: Anyone can read shared spots (for the link sharing feature). Only the creator can delete their shared spot (though delete is not currently in UI, we should secure it). Spots can only be created by signed-in users.
3. **Spot Reports**: Reports must be linked to the signed-in user. Reports are immutable once created (no updates allowed). Reports can be read by anyone (to show a feed later) or restricted to the owner (currently mainly personal, but `SpotReport` type suggests it might be public later). In the current logic, `spotReports` are added by the user.

## The Dirty Dozen Payloads

1. **Identity Spoofing (User Profile)**: Attacker attempts to write to `users/target-uid` while authenticated as `attacker-uid`.
2. **Identity Spoofing (Shared Spot)**: Attacker creates a `sharedSpot` where `creatorId` is `victim-uid`.
3. **Ghost Fields (User Profile)**: Attacker attempts to add `isAdmin: true` to their user profile.
4. **Invalid Values (User Profile)**: Attacker sets `weight: -100` or `skillLevel: 'god-mode'`.
5. **ID Poisoning**: Attacker attempts to create a document at `users/../../evil-path`.
6. **Orphaned Writes**: Attacker creates a `spotReport` without a valid `userId`.
7. **Resource Exhaustion**: Attacker sends a 1MB string for `spotName` in `sharedSpots`.
8. **Privilege Escalation**: Attacker attempts to update a terminal state in a report (not applicable yet, but good to keep in mind).
9. **Unauthorized List**: Attacker attempts to list all user profiles.
10. **Tampering with Time**: Attacker provides a backdated `createdAt` in `spotReports` instead of using server timestamp.
11. **Malicious ID**: Attacker uses a 2KB string as a document ID for a shared spot.
12. **PII Leak**: Attacker attempts to read another user's email from `spotReports`.

## Test Runner (Draft Plan)
- Verify `users/{userId}` is restricted to `request.auth.uid == userId`.
- Verify `sharedSpots` creation requires `request.auth.uid == request.resource.data.creatorId`.
- Verify `spotReports` are immutable and require `request.auth.uid == request.resource.data.userId`.
