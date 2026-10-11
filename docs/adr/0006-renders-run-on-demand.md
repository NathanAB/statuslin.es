# Renders run on demand, not in an always-on worker

Status line previews render in the web server, in the background, started by a submission and by the admin's re-queue and "Run network preview" buttons. Mod previews render from the operator's machine with `render:mods`, after the operator's coding agent picks the input steps. Submissions are rare, the work itself runs in E2B, and the web server is already running, so a machine idling around the clock to wait for submissions was wasted. This replaces the `worker` process, its wake ping and its heartbeat.

## Considered Options

- **A worker machine that sleeps when idle**: Fly starts it on the wake ping and it exits once the queue is empty. It keeps a second process and needs Fly's private proxy setup to start it.
- **Render only when the admin clicks "Render"**: no background work at all, but every review starts with a wait.

## Consequences

- Several web machines can render at once, so a job is claimed with a conditional update, and a job left `running` is re-queued after a time limit rather than at startup.
- Staging stops idle web machines, which can cut a render off; the job is re-queued the next time a machine starts.
- A Desktop recording can take 15 minutes, so mods never render in production.
