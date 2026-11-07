# Google Play Data safety form: answers for XpenceX

Copy these into Play Console > App content > Data safety. They match `public/privacy.html`. If the app starts collecting something new, update both.

Check each answer against the form's wording when you fill it in, because Google can change the questions.

## Overview questions

| Question | Answer |
| --- | --- |
| Does the app collect or share user data? | Yes |
| Is all data encrypted in transit? | Yes |
| Can users ask for their data to be deleted? | Yes: Profile > Delete my account, and by email |
| Account deletion link (web address) | Needed: a page explaining how to delete an account. Section "Keeping and deleting your data" in the privacy policy can serve as this |

## Data types

"Shared" is marked Yes where data goes to Google's Gemini free service, because Google may use it to improve its own products. A company that only works for you wouldn't count as sharing, but that doesn't describe the free service. If you move to the paid Gemini service, review these answers.

| Data type (form category) | Collected | Shared | Optional? | Purpose |
| --- | --- | --- | --- | --- |
| Name (Personal info) | Yes | No | Required | Account management |
| Email address (Personal info) | Yes | No | Required | Account management |
| User IDs (Personal info) | Yes | No | Required | Account management |
| Other financial info (Financial info) | Yes | Yes | Required | App functionality |
| Photos (Photos and videos) | Yes | Yes | Optional | App functionality |
| Files and docs (Files and docs) | Yes | Yes | Optional | App functionality |
| Voice or sound recordings (Audio) | Yes | Yes | Optional | App functionality |
| Other in-app messages (Messages) | Yes | Yes | Optional | App functionality |
| Other user-generated content (App activity) | Yes | Yes | Optional | App functionality |
| Device or other IDs (Device or other IDs) | Yes | No | Required | App functionality, Fraud prevention and security |

Notes:

- **Processed only for a moment:** the form lets you mark data as "processed ephemerally" if it's held only in memory. Don't tick this for photos, files or audio, because Google's free service may keep them.
- **Financial info:** "Required" because the tracker can't work without expense records. Only the parts a user sends to the AI assistant go to Google.
- **Not collected:** location, contacts, calendar, SMS, browsing history, health, and ads or analytics data.

## Other Play Console items

| Item | Answer |
| --- | --- |
| Privacy policy link | Your deployed address + `/privacy.html` |
| Target audience | 18 and over only. Google's Gemini terms don't allow apps directed at, or likely to be used by, under 18s |
| Countries | Leave out the European Economic Area, Switzerland and the United Kingdom while on the free Gemini service. Google's terms require the paid service for users there |
| Ads | No ads |
| Permissions | Microphone. Don't request SMS |
