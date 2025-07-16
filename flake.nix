{
  description = "LinkedIn Lead Warmer Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            postgresql_15
            n8n
            nodePackages.localtunnel
          ];

          shellHook = ''
            echo "🚀 LinkedIn Lead Warmer Development Environment"
            echo "==============================================="
            echo ""
            echo "Available commands:"
            echo "  bun install         - Install dependencies"
            echo "  bun run login       - Run LinkedIn login script"
            echo "  bun run view-profile - Run profile viewing script"
            echo "  bun run engage-post  - Run post engagement script"
            echo ""
            echo "PostgreSQL:"
            echo "  pg_ctl start -D ./data/postgres  - Start PostgreSQL"
            echo "  pg_ctl stop -D ./data/postgres   - Stop PostgreSQL"
            echo "  createdb pulse                   - Create database"
            echo ""
            echo "Migrations:"
            echo "  migrate create -ext sql -dir migrations NAME  - Create new migration"
            echo "  migrate -path migrations -database postgres://localhost/pulse up  - Run migrations"
            echo "  migrate -path migrations -database postgres://localhost/pulse down - Rollback"
            echo ""
            echo "n8n:"
            echo "  n8n start           - Start n8n workflow engine"
            echo ""
            echo "Localtunnel:"
            echo "  lt --port 5678      - Expose n8n to the internet"
            echo "  lt --port 3000      - Expose local dev server"
            echo ""
            
            export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
            export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            export PUPPETEER_HEADLESS=false
            
            # Load .env.dev if it exists
            if [ -f .env.dev ]; then
              set -a
              source .env.dev
              set +a
              echo "✅ Loaded .env.dev"
            else
              echo "⚠️  No .env.dev found - create one from .env.example"
            fi
            
            # Create data directory if it doesn't exist
            if [ ! -d "./data" ]; then
              mkdir -p ./data
            fi
            
            # Initialize PostgreSQL data directory if it doesn't exist
            if [ ! -d "./data/postgres" ]; then
              echo ""
              echo "📦 Initializing PostgreSQL data directory..."
              initdb -D ./data/postgres
              echo "✅ PostgreSQL initialized. Start with: pg_ctl start -D ./data/postgres"
            fi
          '';
        };
      });
}