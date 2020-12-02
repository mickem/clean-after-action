# Cleanup after build

Cleanup the work directory for self hosted runners after they finish building.

## Example usage

```yaml
- uses: mickem/clean-after-action@v1
```

It is important that this is run before any caching tasks as cleanups are run in reverse order.

## What about docker actions?

If you use docker actions files will be created by "root" and this action will fail to delete generated files.

This can be solved by forcing docker containers to run as the same user as the user which runs your self hosted runner.
[To do this you can use the user-remap feature in docker](https://docs.docker.com/engine/security/userns-remap/).

## Motivation

There are a number of other actions which "solves this problem" by deleting files as the actiont ask (instead of cleanup.
The main problem with using a delete-task is that it will run "before other cleanup steps".
This will effectively break things like caching and similar things which require files to be left when their cleanup runs. 
