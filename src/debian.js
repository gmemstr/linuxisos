import { WorkflowEntrypoint } from "cloudflare:workers"
import bencode from 'bencode'

export class DebianWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		let hrefs = await step.do("fetch iso and torrent hrefs", async () => {
			const res = await fetch('https://www.debian.org/distrib/', {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});

			const torrents = [];
			const rewriter = new HTMLRewriter()
				.on('a[href*="bt"]', {
					element(element) {
						torrents.push(element.getAttribute('href'));
					},
				});

			const _ = await rewriter.transform(res).arrayBuffer();

			return { torrents: torrents };
		});


		let torrents = await step.do("get torrent files", async () => {
			const torrentFiles = [];
			for (const link of hrefs.torrents) {
				if (link.endsWith('.torrent')) {
					torrentFiles.push(link);
				} else {
					const torRewriter = new HTMLRewriter().on('.indexcolname > a[href$="torrent"]', {
						element(element) {
							torrentFiles.push(`${link}${element.getAttribute('href')}`);
						},
					});
					await torRewriter
						.transform(
							await fetch(link, {
								headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
							}),
						)
						.arrayBuffer();
				}
			}
			return torrentFiles;
		});

		const existing = await step.do("filter existing Debian torrents", async () => {
			const files = await this.env.R2.list({prefix: "debian-"});
			const obj = {};
			files.objects.forEach((object) => obj[object.key] = true);
			return obj;
		});

		const mods = []
		for (const torrent of torrents) {
			const torrentUrl = new URL(torrent);
			const torrentFilename = torrentUrl.pathname.split('/').pop();
			if (existing[torrentFilename]) {
				continue
			}
			mods.push(step.do(`download and modify ${torrentFilename}`, async () => {
				const resp = await fetch(torrent);
				const buff = await resp.arrayBuffer();
				const b2 = Buffer.from(new  Uint8Array(buff));
				const result = bencode.decode(b2);
				if (!result.hasOwnProperty('announce-list')) {
					result['announce-list'] = [];
				}
				result['announce-list'].push(['https://linuxisos-tracker.gmem.ca/announce']);
				if (result.hasOwnProperty('announce') && result['announce'] !== "") {
					result['announce-list'].push([result['announce']]);
					delete result['announce'];
				}

				const encodedTorrent = bencode.encode(result);
				this.env.R2.put(torrentFilename, encodedTorrent);
			}));
		}
		await Promise.all(mods);
	}
}
