module.exports = {
  apps: [{
    name: 'phineup-mcp-server',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'info'
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    },
    // Production settings
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Logging
    log_file: 'logs/pm2-combined.log',
    out_file: 'logs/pm2-out.log',
    error_file: 'logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Restart policy
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // Watch mode (development only)
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'temp', 'dist'],
    
    // Health check
    health_check_grace_period: 3000,
    
    // Environment variables
    env_file: '.env'
  }]
};
