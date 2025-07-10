{
  description = "LinkedIn Lead Warmer Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            postgresql_15
          ];

          shellHook = ''
            export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
            export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            export PUPPETEER_HEADLESS=false
            
            # Load .env.dev if it exists
            if [ -f .env.dev ]; then
              set -a
              source .env.dev
              set +a
              echo "✅ Loaded .env.dev"
            fi
          '';
        };
      });
}