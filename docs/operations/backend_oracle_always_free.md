# Backend Deploy (Oracle Always Free VM)

This repo deploys backend services to a VM using Docker Compose and GitHub Actions.

Target: **Oracle Cloud Always Free** (Ampere A1) running Ubuntu.

## 1. Create the VM

1. Create an Oracle Cloud account.
2. Create a compute instance:
3. Pick an Always Free shape (Ampere A1 if available).
4. OS image: Ubuntu 22.04+.
5. Add an SSH key for your own admin access (not the GitHub Actions key yet).

## 2. Install Docker + Compose on the VM

On the VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Create a deploy user (example `twistdeploy`) and allow docker:

```bash
sudo adduser --disabled-password --gecos "" twistdeploy
sudo usermod -aG docker twistdeploy
```

## 3. Authorize GitHub Actions SSH key on the VM

Use the public keys in `docs/operations/backend_deploy_ssh_keys.md`.

On the VM (as `twistdeploy`):

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Add the **staging** or **production** public key.

## 4. Open firewall / security list

At minimum, allow inbound SSH (22) so GitHub Actions can connect.

For initial testing you can also allow:
- `3001` (auth-service)
- `3003` (influencer-api)

Production-hardening:
- Prefer only `80/443` inbound and put a reverse proxy in front (Caddy/nginx) or use a tunnel.

## 5. Configure GitHub Environment secrets

These are environment-scoped secrets and must be set in both `staging` and `production` environments:

Deployment target:
- `BACKEND_DEPLOY_HOST`: VM IP or DNS name
- `BACKEND_DEPLOY_USER`: e.g. `twistdeploy`
- `BACKEND_DEPLOY_PATH`: e.g. `/opt/twist/<env>`
- `BACKEND_DEPLOY_PORT` (optional): default `22`
- `BACKEND_DEPLOY_KNOWN_HOSTS` (optional): output of `ssh-keyscan -H <host>`

Backend runtime config (already generated for you, but can be rotated):
- `BACKEND_DB_PASSWORD`
- `BACKEND_REDIS_PASSWORD`
- `BACKEND_JWT_SECRET`

Optional backend config:
- `BACKEND_ALLOWED_ORIGINS`
- `BACKEND_WALLET_PRIVATE_KEY`

## 6. Deploy

Staging auto-deploys on pushes to `main` that touch backend paths (or run manually):
- Workflow: `Deploy Backend (Staging)`

Production deploy is manual and gated by the GitHub `production` environment:
- Workflow: `Deploy Backend (Production)`

## 7. Verify

On the VM:

```bash
cd /opt/twist/<env>
docker compose --env-file .env.backend -f docker-compose.backend.yml ps
curl -fsS http://localhost:3001/health
curl -fsS http://localhost:3003/health
```

