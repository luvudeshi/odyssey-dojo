#!/bin/sh
# Sets up a fresh Ubuntu 24.04 instance to host the game, and updates it later. Run it as root:
#
#   sh setup.sh
#
# It is safe to run again. Each run: installs Docker if it is missing, gets or updates the code in
# /opt/odyssey-dojo, and starts (or rebuilds) the game and Caddy. It takes no keys and no passwords.
# The only setting it needs is DOMAIN, read from /opt/odyssey-dojo/deploy/vultr/.env.
# The steps for a person are in docs/deploy-vultr.md.
set -eu

APP_DIR="${APP_DIR:-/opt/odyssey-dojo}"
REPO_PATH="${REPO_PATH:-toyeshhm/odyssey-dojo}"
BRANCH="${BRANCH:-main}"
DEPLOY_KEY="${DEPLOY_KEY:-/root/.ssh/odyssey_dojo_deploy}"
KIT="$APP_DIR/deploy/vultr"

say() { printf '\n== %s\n' "$*"; }
stop() { printf '\n%s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || stop "Run this as root: sudo sh setup.sh"
command -v apt-get >/dev/null 2>&1 || stop "This script is for Ubuntu (it uses apt-get)."

# --- 1. Docker, from Docker's own apt repository ---
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  say "Docker is already installed"
else
  say "Installing Docker"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl git openssh-client
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
command -v git >/dev/null 2>&1 || apt-get install -y git

# --- 2. Swap, so the build does not run out of memory on a small instance ---
MEM_KB=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
SWAP_KB=$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)
if [ "$MEM_KB" -lt 3500000 ] && [ "$SWAP_KB" -eq 0 ] && [ ! -e /swapfile ]; then
  say "Adding 2 GB of swap for the build"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- 3. The code ---
# With the deploy key, git talks to GitHub over SSH with that key and nothing else.
KEY_SSH="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

if [ -d "$APP_DIR/.git" ]; then
  say "Updating the code in $APP_DIR"
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" merge --ff-only "origin/$BRANCH"
else
  say "Getting the code into $APP_DIR"
  if [ -f "$DEPLOY_KEY" ]; then
    # A private repo, and the deploy key from an earlier run is there.
    if ! GIT_SSH_COMMAND="$KEY_SSH" git clone --branch "$BRANCH" "git@github.com:$REPO_PATH.git" "$APP_DIR"; then
      printf '\nGitHub refused the key. Add this public key under the repo: Settings, Deploy keys, Add deploy key\n(read-only is enough), then run this script again:\n\n'
      cat "$DEPLOY_KEY.pub"
      exit 1
    fi
    git -C "$APP_DIR" config core.sshCommand "$KEY_SSH"
  elif GIT_TERMINAL_PROMPT=0 git clone --branch "$BRANCH" "https://github.com/$REPO_PATH.git" "$APP_DIR" 2>/dev/null; then
    : # A public repo: nothing more to do.
  else
    # A private repo. Make a key that lives only on this instance; its public half is not a secret.
    mkdir -p "$(dirname "$DEPLOY_KEY")"
    chmod 700 "$(dirname "$DEPLOY_KEY")"
    ssh-keygen -q -t ed25519 -N "" -C "odyssey-dojo-vultr" -f "$DEPLOY_KEY"
    printf '\nThe repo is private, so this instance needs a read-only deploy key.\n'
    printf 'A repo admin adds this public key on GitHub under the repo: Settings, Deploy keys, Add deploy key.\n'
    printf 'Leave "Allow write access" off. Then run this script again.\n\n'
    cat "$DEPLOY_KEY.pub"
    exit 1
  fi
fi

# --- 4. The settings ---
if [ ! -f "$KIT/.env" ]; then
  cp "$KIT/.env.example" "$KIT/.env"
  chmod 600 "$KIT/.env"
  printf '\nMade %s from the example.\n' "$KIT/.env"
  printf 'Open it (nano %s), set DOMAIN to the registered domain, save, and run this script again.\n' "$KIT/.env"
  exit 1
fi
chmod 600 "$KIT/.env"

# Only the DOMAIN line is read here. Nothing from the file is printed but the domain.
DOMAIN=$(sed -n 's/^[[:space:]]*DOMAIN[[:space:]]*=[[:space:]]*//p' "$KIT/.env" | tail -n 1 | tr -d '"'"'"' \r\t')
[ -n "$DOMAIN" ] || stop "DOMAIN is empty in $KIT/.env. Set it to the domain, for example DOMAIN=odysseydojo.us"
case "$DOMAIN" in
  *://* | */* | *:*) stop "DOMAIN must be the bare name, with no https:// and no slash. For example DOMAIN=odysseydojo.us" ;;
  *.*) ;;
  *) stop "DOMAIN does not look like a domain: $DOMAIN" ;;
esac

# --- 5. The firewall: web traffic in. Docker opens its own ports too; this keeps ufw's list honest. ---
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw allow 443/udp >/dev/null 2>&1 || true
fi

# --- 6. Build and start ---
say "Building and starting the game for https://$DOMAIN (the first build takes a few minutes)"
cd "$KIT"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

say "Running"
docker compose ps
printf '\nOpen https://%s in a browser. The first visit can take up to a minute while Caddy gets its certificate.\n' "$DOMAIN"
printf 'If it does not load: check the DNS A record points at this instance, then: cd %s && docker compose logs caddy\n' "$KIT"
