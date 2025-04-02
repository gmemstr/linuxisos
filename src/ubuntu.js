import { WorkflowEntrypoint } from "cloudflare:workers"
import bencode from 'bencode'

export class UbuntuWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		let torrents = await step.do("fetch iso and torrent hrefs", async () => {
			const res = await fetch('https://ubuntu.com/download/alternative-downloads', {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});

			const torrents = [];
			const rewriter = new HTMLRewriter()
				.on('a[href$=".torrent"]', {
					element(element) {
						torrents.push(element.getAttribute('href'));
					},
				})

			const _ = await rewriter.transform(res).arrayBuffer();

			return torrents;
		});

		const existing = await step.do("filter existing Ubuntu torrents", async () => {
			const files = await this.env.R2.list({prefix: "ubuntu-"});
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
