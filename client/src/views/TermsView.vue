<script setup>
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden font-sans">
    <div class="w-full max-w-3xl bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 p-6 md:p-8">
      <h1 class="text-3xl font-bold text-white mb-2 text-center">Terms of Service & Privacy Policy</h1>
      <p class="text-on-surface-variant text-center mb-8">Effective Date: November 30, 2025</p>

      <section class="space-y-6">
        <h2 class="text-2xl font-bold text-white">I. Terms of Service</h2>

        <div>
          <h3 class="text-white font-bold mb-2">1. Acceptance of Terms</h3>
          <p class="text-on-surface-variant">By accessing or using the "Durak Online" Telegram Bot and Web App (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service.</p>
        </div>

        <div>
          <h3 class="text-white font-bold mb-2">2. User Accounts</h3>
          <p class="text-on-surface-variant mb-2">2.1. Account Types: The Service offers two types of accounts:</p>
          <ul class="list-disc pl-6 text-on-surface-variant space-y-1">
            <li>Telegram-Linked: Accounts created via Telegram. Access relies on your Telegram account.</li>
            <li>Full Access: Accounts with a password set via the Bot or Website.</li>
          </ul>
          <p class="text-on-surface-variant mt-3">2.2. Security: You are responsible for maintaining the confidentiality of your account credentials. The Administration is not liable for any loss of access resulting from lost Telegram accounts or forgotten passwords.</p>
          <p class="text-on-surface-variant mt-2">2.3. Termination: We reserve the right to delete accounts that have been inactive for more than 12 months.</p>
        </div>

        <div>
          <h3 class="text-white font-bold mb-2">3. User Conduct</h3>
          <p class="text-on-surface-variant mb-2">You agree NOT to:</p>
          <ul class="list-disc pl-6 text-on-surface-variant space-y-1">
            <li>Use cheats, automation software (bots), hacks, or mods.</li>
            <li>Exploit bugs or glitches (please report them instead).</li>
            <li>Create multiple accounts to manipulate ratings ("farming").</li>
            <li>Use offensive, hateful, or inappropriate language in usernames or chat.</li>
          </ul>
          <p class="text-on-surface-variant mt-2">Violation of these rules may result in a temporary or permanent ban without prior notice.</p>
        </div>

        <div>
          <h3 class="text-white font-bold mb-2">4. Virtual Currency and Donations</h3>
          <p class="text-on-surface-variant mb-2">4.1. Virtual Items: The Service may include virtual currency ("Coins") or items. These have no real-world monetary value and cannot be exchanged for fiat currency.</p>
          <p class="text-on-surface-variant mb-2">4.2. Telegram Stars (Donations):</p>
          <ul class="list-disc pl-6 text-on-surface-variant space-y-1">
            <li>Users may voluntarily support the development of the Service using Telegram Stars (XTR).</li>
            <li>All payments made via Telegram Stars are considered voluntary donations.</li>
            <li>Donations are non-refundable.</li>
            <li>Donating does not exempt users from the Terms of Service (e.g., you can still be banned for cheating).</li>
          </ul>
        </div>

        <div>
          <h3 class="text-white font-bold mb-2">5. Disclaimer of Warranties</h3>
          <p class="text-on-surface-variant">The Service is provided on an "AS IS" and "AS AVAILABLE" basis. We do not guarantee that the Service will be uninterrupted, error-free, or secure. We are not responsible for downtimes caused by Telegram API issues or server maintenance.</p>
        </div>
      </section>

      <section class="space-y-6 mt-10">
        <h2 class="text-2xl font-bold text-white">II. Privacy Policy</h2>

        <div>
          <h3 class="text-white font-bold mb-2">1. Information We Collect</h3>
          <p class="text-on-surface-variant">To provide the Service, we collect and store the following data:</p>
          <ul class="list-disc pl-6 text-on-surface-variant space-y-1 mt-2">
            <li>Telegram Data: Your Telegram ID, First Name, Username, and Language Code (provided automatically by Telegram).</li>
            <li>Game Data: Match history, win/loss records, ratings, and achievements.</li>
            <li>Social Data: Your friends list and friend requests within the game.</li>
            <li>Technical Data: IP address and device type (for security and anti-cheat purposes).</li>
          </ul>
        </div>

        <div>
          <h3 class="text-white font-bold mb-2">2. How We Use Your Information</h3>
          <ul class="list-disc pl-6 text-on-surface-variant space-y-1">
            <li>Core Functionality: To create your account, save your progress, and allow you to play.</li>
            <li>Leaderboards: Your username and rating are displayed publicly in the global leaderboards.</li>
            <li>Security: To detect cheating, multi-accounting, and unauthorized access.</li>
          </ul>
        </div>

        <div>
          <h3 class="text-white font-bold mb-2">3. Data Sharing</h3>
          <p class="text-on-surface-variant">We do not sell or rent your personal data to third parties. Data may only be disclosed if required by law.</p>
        </div>

        <div>
          <h3 class="text-white font-bold mb-2">4. Data Control</h3>
          <ul class="list-disc pl-6 text-on-surface-variant space-y-1">
            <li>Visibility: Other players can see your nickname, avatar, and game statistics.</li>
            <li>Account Deletion: You may request the deletion of your account and all associated data by contacting the developer or using the appropriate command in the bot (if available).</li>
          </ul>
        </div>

        <div>
          <h3 class="text-white font-bold mb-2">5. Third-Party Services</h3>
          <p class="text-on-surface-variant">The Service operates within the Telegram ecosystem. By using the Service, you are also subject to Telegram's Privacy Policy and Terms of Service.</p>
        </div>
      </section>

      <div class="mt-10 text-center">
        <router-link to="/" class="text-primary hover:underline font-bold">Return to Home</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
