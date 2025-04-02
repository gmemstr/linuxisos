import { WorkflowEntrypoint } from "cloudflare:workers"
import bencode from 'bencode'

export class ArchLinuxWorkflow extends WorkflowEntrypoint {
	async run (event, step) {
		let torrentUrl = await step.do("fetch iso and torrent hrefs", async () => {
			const res = await fetch('https://archlinux.org/download/', {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});

			let torrentUrl = "";
			const rewriter = new HTMLRewriter()
				.on('a[title="Download torrent"]', {
					element(element) {
						torrentUrl = `https://archlinux.org${element.getAttribute('href')}`;
					},
				})

			const _ = await rewriter.transform(res).arrayBuffer();

			return torrentUrl;
		});
		let torrentFilename = await step.do("get torrent url", async () => {
			const torrentFile = await fetch(torrentUrl, {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});
			return torrentFile.headers.get('content-disposition')
				.split(';')
				.find(n => n.includes('filename='))
				.replace('filename=', '')
				.trim();
		});

		await step.do("download and modify torrent", async () => {
			if (await this.env.R2.get(torrentFilename) !== null) {
				console.log("torrent file already exists in r2");
				return;
			}
			const resp = await fetch(torrentUrl);
			const buff = await resp.arrayBuffer();
			const b2 = Buffer.from(new  Uint8Array(buff));
			const result = bencode.decode(b2);
			if (!result.hasOwnProperty('announce-list')) {
				result['announce-list'] = [];
			}
			result['announce-list'].push(['https://linuxisos-tracker.gmem.ca/announce']);

			const encodedTorrent = bencode.encode(result);
			this.env.R2.put(torrentFilename, encodedTorrent);
		});
	}
}
