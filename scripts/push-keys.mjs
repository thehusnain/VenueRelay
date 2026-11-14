import { generateVAPIDKeys } from 'web-push';
const keys = generateVAPIDKeys();
console.log(
  `Add these to your private .env file:\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:YOUR_CONTACT_EMAIL\n\nKeep the private key out of your repository. Restart Rally after configuring push.`,
);
