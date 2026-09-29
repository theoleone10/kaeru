/**
 * In-app legal pages. The same text must be published at a public URL for
 * App Store Connect (App Privacy → Privacy Policy URL). Keep both in sync.
 */
export interface LegalDoc {
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
}

export const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';

const contact = supportEmail ? `email ${supportEmail}` : 'use the contact details on the App Store listing';

export const privacyPolicy: LegalDoc = {
  title: 'Privacy Policy',
  updated: '29 September 2026',
  sections: [
    {
      heading: 'Summary',
      body: 'You can use the app without an account, in which case everything stays on your phone. If you create an account, we store your email address and your study progress so you can back it up and use it on another device. We do not show ads, sell data, or track you across apps and websites.',
    },
    {
      heading: 'Data stored on your phone',
      body: 'Your learned grammar points, review history, review schedule and settings are stored in a database on your device. Review reminders are scheduled locally by your phone; no push service is involved.',
    },
    {
      heading: 'Data stored with an account',
      body: 'When you sign in with Apple, Google or email we receive your email address (Apple may give us a private relay address instead) and, if you choose to share it, your name. We also store a copy of your study progress and settings so it can be restored. This data is held by our hosting provider, Supabase, on our behalf, and is used only to provide sign-in and backup.',
    },
    {
      heading: 'What we do not collect',
      body: 'We do not collect location, contacts, photos, advertising identifiers, analytics or crash-tracking data, and we do not use third-party advertising or tracking SDKs.',
    },
    {
      heading: 'Deleting your data',
      body: 'Settings → Account → Delete account permanently deletes your account and the progress stored with it. Progress stored only on your phone is removed when you delete the app.',
    },
    {
      heading: 'Children',
      body: 'The app is a general-audience study tool and is not directed at children under 13.',
    },
    {
      heading: 'Contact',
      body: `For any privacy question or request, ${contact}.`,
    },
  ],
};

export const termsOfUse: LegalDoc = {
  title: 'Terms of Use',
  updated: '29 September 2026',
  sections: [
    {
      heading: 'Using the app',
      body: 'This app helps you study Japanese grammar. It is provided free of charge for personal study. Grammar explanations and example sentences are provided for learning purposes and may contain mistakes.',
    },
    {
      heading: 'Your account',
      body: 'An account is optional. If you create one, keep your sign-in details safe. You can delete your account at any time from Settings.',
    },
    {
      heading: 'Acceptable use',
      body: 'Do not misuse the service, attempt to access other people’s data, or interfere with its operation.',
    },
    {
      heading: 'No warranty',
      body: 'The app is provided “as is”, without warranties of any kind. We are not liable for any loss arising from its use, including loss of study progress; exporting a backup from Settings is recommended.',
    },
    {
      heading: 'Changes',
      body: 'These terms may be updated from time to time. Continuing to use the app after a change means you accept the updated terms.',
    },
    {
      heading: 'Contact',
      body: `Questions about these terms: ${contact}.`,
    },
  ],
};
