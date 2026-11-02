# ClaimTrace setup

What's left to do, in order.

## What's left

- [ ] Get an OpenRouter key and a Tavily key
- [ ] Switch the default AI models to free ones
- [ ] Run one real check on your laptop
- [ ] Create an AWS account and launch the server
- [ ] Run the app on the server
- [ ] Optional: clear the GitHub billing lock, so CI can run

## 1. Get your keys

| Service | Needed? | Where |
|---|---|---|
| OpenRouter (AI models) | Yes | [openrouter.ai](https://openrouter.ai), then Keys |
| Tavily (web search) | Yes | [tavily.com](https://tavily.com), free for 1,000 credits a month |
| Google Fact Check | No, the app skips this step without it | [Google Cloud console](https://console.cloud.google.com), enable "Fact Check Tools API" |

Never paste keys into a chat or commit them. Only put them in `backend/.env`, which git ignores.

## 2. Switch to free models

The default models cost money. Ask Claude to switch them to free ones, or change them in `backend/app/core/config.py`.

Free models have strict rate limits, may log what you send, and haven't been tested with this app. Don't put private information in checks.

## 3. Run it on your laptop

From the repo root:

```bash
cp backend/.env.example backend/.env
```

Add your keys to `backend/.env`, then point the frontend at the backend:

```bash
cp frontend/.env.example frontend/.env.local
```

Start each one in its own terminal:

```bash
uv run --directory backend uvicorn app.main:app --port 8000
```

```bash
npm --prefix frontend run dev
```

Open http://localhost:5173 and run a check. The AI and web search have never run for real, so expect to fix a few things here.

## 4. Create the AWS server

1. Sign up at [aws.amazon.com](https://aws.amazon.com) and choose the **Free plan**. Read what it says about charges before you confirm.
2. Set a budget alert of about $1 under **Billing → Budgets**.
3. Go to **EC2 → Launch instance**, in the **Singapore** region:

| Setting | Choose |
|---|---|
| Image | Ubuntu 24.04 |
| Instance type | `t3.small` (2 vCPU, 2 GB RAM) |
| Key pair | Create one and download the `.pem` file. You can't download it again |
| Firewall | SSH from **My IP**, and HTTP from anywhere |
| Storage | 20 GB gp3 |

## 5. Run it on the server

Connect from your laptop:

```bash
chmod 400 your-key.pem
```

```bash
ssh -i your-key.pem ubuntu@YOUR_SERVER_IP
```

Then run these on the server, one at a time.

Add swap, so the first build doesn't run out of memory:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Get the code:

```bash
git clone -b demo_fastapi https://github.com/Chiseled141/AI-Assisted-Fact-Checking-Review-.git claimtrace && cd claimtrace
```

Create a random database password:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
```

Create the settings file and add your keys:

```bash
cp backend/.env.example backend/.env && nano backend/.env
```

Start everything. The first build takes several minutes:

```bash
sudo docker compose up -d --build
```

Open `http://YOUR_SERVER_IP`. Docker has never been run on this project, so the first try may hit errors.

To see what went wrong:

```bash
sudo docker compose logs --tail 50
```

## Good to know

- **Saving credit:** stop the instance when you aren't using it. Storage and the public IP can still use credit, so delete everything when the project ends.
- **New IP:** the public IP normally changes when you start the instance again.
- **Out of memory:** if `t3.small` struggles, stop the instance, choose **Actions → Instance settings → Change instance type**, and pick `t3.medium`. It costs about twice as much per hour.
- **Anyone can use it:** there are no logins. Anyone with the link can start checks, up to 30 an hour per address, and use up your Tavily credits. They could also publish corrections through the API.
- **No HTTPS:** the site runs on plain `http://`, so don't enter anything private. HTTPS needs a domain name.
- **GitHub CI:** it can't run while the account has a billing lock. Your code still pushes fine, and you can run the same tests on your laptop. The [Student Developer Pack](https://education.github.com/pack) or [GitHub Support](https://support.github.com) may help.
- **Still undecided:** the verdict labels and the AI model pair, listed under "Open decisions" in `AGENT.md`.
