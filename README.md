# Linux ISOs Tracker

Track Linux ISO torrents and generate feeds for consumption.

## Overview

This project uses Cloudflare Workers and R2 storage to provide a list of available Linux ISO torrents
for download and seeding. Includes a worker that generates an RSS and Atom feed of the available ISOs,
as well as a simple web interface to display the list of ISOs.

## Features

* Provide a web interface, RSS and Atom feeds of available Linux ISO torrents
* Uses Cloudflare Workers, R2 storage, and Workflows
* Includes cron to automate the updating torrent files

## Getting Started

To get started with this project, you will need to have the following:

* A Cloudflare account
* A Cloudflare R2 storage bucket
* Node.js

You can then clone this repository and run the following command to deploy the worker:
```bash
npm run deploy
```

## Contributing

Contributions to this project are welcome. Pull requests and issues can be opened [on GitHub](https://github.com/gmemstr/linuxisos),
and PRs will be applied to Forgejo and mirrored to GitHub.
