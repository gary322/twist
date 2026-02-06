# Backend Deploy SSH Keys (Public)

These are the **public** SSH keys used by GitHub Actions to deploy backend services to your staging/production VM via SSH.

Add the relevant key to the target VM’s `~/.ssh/authorized_keys` for the deploy user.

## Staging

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICDTCsxAEvQ3gRDJxIds/dKKsh++653OJ2gatJtv065i twist-staging-deploy
```

## Production

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICd7vw6YQpIW+/vhj1dBAToMaErBo17h5V8sQXjp51zD twist-production-deploy
```

