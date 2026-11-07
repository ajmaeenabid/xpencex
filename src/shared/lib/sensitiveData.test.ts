import { describe, it, expect } from 'vitest';
import { containsSecret } from './sensitiveData';

describe('containsSecret', () => {
  it.each([
    'Your bKash verification code is 482913. Do not share it with anyone.',
    'OTP: 5521',
    'Your OTP for login is 731044, valid for 5 minutes',
    '482913 is your Facebook code',
    '738201 is your OTP',
    'my bkash pin is 12345',
    'PIN 4821',
    'Your password: 99887766',
    'Use one-time password 552190 to confirm the payment of Tk 500',
    'আপনার ওটিপি 482913',
    'আপনার পিন 1234',
    'CVV 1234 for card',
    // Real bKash OTP SMS: the code is far from the word "OTP", with an amount and a merchant code in between
    'Do NOT share your OTP or PIN with anyone. Your bKash OTP for PAYMENT of Tk.1,025.64 to Software Shop Limited-AG RM4673 is 017006. Expires in 2 min.',
    'Your Nagad OTP for Send Money of Tk 500.00 to •••• is 482913',
    'Your verification code for logging in to your bank account on the new device is 5521',
    // Test messages from the user: phishing alerts, router passwords, split OTPs, locker PINs, seed phrases
    '[ALERT] SecureAuth System Log: A login attempt was detected from IP 192.168.1.105 (London, UK) for account admin_user. If this was you, please enter the temporary authorization PIN 849201 into your browser window within the next 05:00 minutes. Reference ID: #TRX-9942A. Do not reply to this automated text.',
    'Hey! I just set up the temporary router for the event. The admin portal is at 10.0.0.1 and the default passcode is Admin@Pass9921 – please change it as soon as you log in. Oh, and here is the shipping confirmation pin for the hardware drop-off: 4721. Text me when you get there!',
    'The admin portal is at 10.0.0.1 and the default passcode is Admin@Pass!',
    'Wi-Fi password: hunter22',
    'Your Bank Alert: Congratulations! Your application for the Platinum Rewards Card has been pre-approved. Tap bit.ly/fake-bank to claim. To finalize your current mobile banking session and verify your device, use One-Time Passcode (OTP): 309-842. Valid for 2 mins. Bank representatives will NEVER ask for this code.',
    'ExpressDelivery: Your package from vendor AMZN_4920A is scheduled for delivery today between 2 PM and 4 PM. Your secure locker collection PIN is 9013. Provide this code at the kiosk or to the courier upon arrival. Track live: ://express-dlv.com',
    'Backup Reminder: Do not share your recovery details with anyone. Your private shard key for the legacy vault (Wallet ending in ...8F9c) is: "orbit-jacket-velvet-8402-quantum". Keep this offline.',
    'My seed phrase is apple river candle stone forest moon',
  ])('blocks: %s', (text) => {
    expect(containsSecret(text)).toBe(true);
  });

  it.each([
    // Real transaction SMS, including the usual safety footers
    'You have received Tk 200.00 from ••••. Fee Tk 0.00. Balance Tk 2,710.99. TrxID DJK5AE01ZF at 20/10/2026 14:45',
    'TK 620.00 has been credited to your A/C •••• on 20-10-26. Your A/C balance is TK 985.46. For Enquiry call: 16221',
    'Payment Tk 1,200.00 to Daraz successful. Never share your PIN or OTP with anyone. Call 16247',
    'bKash never asks for your PIN or OTP. Helpline 16247',
    'Do not share your PIN. Hotline: 16216',
    // Normal chat
    'I spent 2500 taka on food',
    'what is an OTP and why should I keep my PIN safe?',
    'Show my weekly report for 2026',
    'Paid Tk 4500 for rent',
    'Never share your PIN or OTP with anyone, call 16247 for help',
    'Your OTP request on 20/10/2026 at 14:45 was cancelled.',
    'Payment of Tk.1,025.64 to Software Shop Limited-AG RM4673 is successful. Never share your OTP.',
    'Your OTP request on 20-10-26 was cancelled.',
    'Never share your private key or seed phrase with anyone.',
    'Change your password regularly and keep it safe.',
    'Your password is strong.',
    'Do not share your recovery details with anyone.',
  ])('allows: %s', (text) => {
    expect(containsSecret(text)).toBe(false);
  });
});
