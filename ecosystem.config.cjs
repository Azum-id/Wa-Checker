module.exports = {
  apps: [
    {
      name: 'Whatsapp Checker',
      script: './index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 5000,  // Delay restart untuk mencegah loop terlalu cepat
      max_restarts: 10,     // Maksimal 10 kali restart sebelum berhenti
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
