module.exports = {
  apps: [
    {
      name: 'exam-server',
      script: './src/app.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 50001,
      },
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      max_size: '10M',
      max_files: 10,
    },
    {
      name: 'exam-worker',
      script: './src/worker.js',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 50001,
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      max_size: '10M',
      max_files: 5,
    },
  ],
};
