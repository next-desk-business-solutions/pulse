{ pkgs, lib ? pkgs.lib, config ? null, ... }:

let
  # Default configuration for n8n deployment
  defaultConfig = {
    port = 5678;
    url = "https://n8n.workwithnextdesk.com";
    database = {
      host = "twenty-db-1";
      port = 5432;
      user = "postgres";
      password = "postgres";
      passwordFile = null;
      database = "n8n";
    };
    redis = {
      host = "twenty-redis-1";
      port = 6379;
    };
    basicAuth = {
      enabled = true;
      user = "admin";
      passwordFile = null;
    };
    encryptionKeyFile = null;
    pulseProjectPath = "";
  };

  # Use provided config or fallback to defaults
  cfg = lib.recursiveUpdate defaultConfig (if config != null then config else {});

  # Non-secret environment variables always included
  baseEnv = {
    NODE_ENV = "production";
    
    # n8n configuration
    N8N_HOST = "0.0.0.0";
    N8N_PORT = toString cfg.port;
    N8N_PROTOCOL = "https";
    WEBHOOK_URL = cfg.url;
    
    # Database configuration (non-secret)
    DB_TYPE = "postgresdb";
    DB_POSTGRESDB_HOST = cfg.database.host;
    DB_POSTGRESDB_PORT = toString cfg.database.port;
    DB_POSTGRESDB_DATABASE = cfg.database.database;
    DB_POSTGRESDB_USER = cfg.database.user;
    DB_POSTGRESDB_SCHEMA = "public";
    
    # Redis configuration (non-secret)
    REDIS_URL = "redis://${cfg.redis.host}:${toString cfg.redis.port}";
    
    # Basic auth configuration (non-secret)
    N8N_BASIC_AUTH_ACTIVE = if cfg.basicAuth.enabled then "true" else "false";
    N8N_BASIC_AUTH_USER = cfg.basicAuth.user;
    
    # Security settings
    N8N_SECURE_COOKIE = "true";
    N8N_FORCE_SSL = "true";
    
    # Node.js configuration - Allow external modules for pulse scripts
    NODE_FUNCTION_ALLOW_EXTERNAL = "axios,fs,path,child_process,util";
    
    # Timezone configuration
    GENERIC_TIMEZONE = "UTC";
    TZ = "UTC";
    
    # Disable telemetry
    N8N_DIAGNOSTICS_ENABLED = "false";
    
    # Workflow settings
    WORKFLOWS_DEFAULT_NAME = "Pulse Workflow";
    N8N_DEFAULT_BINARY_DATA_MODE = "filesystem";
    
    # Execution settings
    EXECUTIONS_DATA_SAVE_ON_ERROR = "all";
    EXECUTIONS_DATA_SAVE_ON_SUCCESS = "all";
    EXECUTIONS_DATA_MAX_AGE = "168"; # 7 days
  };
  
  # Environment variables for container
  # When using secret files, only include baseEnv
  # All secrets will be provided via the env file created by systemd preStart
  environment = baseEnv;
  
  # Environment file for containers when using secrets
  envFile = lib.optionals (cfg.database.passwordFile != null || cfg.encryptionKeyFile != null || cfg.basicAuth.passwordFile != null) [
    "/run/n8n/env"
  ];
  
  # Volume mounts for secrets
  secretVolumes = lib.optionals (cfg.database.passwordFile != null || cfg.encryptionKeyFile != null || cfg.basicAuth.passwordFile != null) [
    "/run/agenix:/secrets:ro"
  ];
in
{
  project.name = "n8n";
  
  # Network configuration to connect with Twenty's containers
  networks.default.external = false;
  networks.twenty = {
    external = true;
  };

  services = {
    # n8n application
    n8n = {
      service = {
        image = "n8nio/n8n:latest";
        ports = [ "${toString cfg.port}:${toString cfg.port}" ];
        
        volumes = [
          "n8n-data:/home/node/.n8n"
          "${cfg.pulseProjectPath}:/workspace/pulse:ro"
        ] ++ secretVolumes;
        
        environment = environment;
        
        env_file = envFile;
        
        networks = [ "default" "twenty" ];
        
        restart = "always";
        
        # Health check
        healthcheck = {
          test = ["CMD-SHELL" "curl -f http://localhost:${toString cfg.port}/healthz || exit 1"];
          interval = "30s";
          timeout = "10s";
          retries = 3;
          start_period = "60s";
        };
      };
    };
  };

  # Docker volumes
  docker-compose.volumes = {
    n8n-data = {};
  };
}