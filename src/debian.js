import { WorkflowEntrypoint } from "cloudflare:workers"
import bencode from 'bencode'

export class DebianWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		let hrefs = await step.do("fetch iso and torrent hrefs", async () => {
			const res = await fetch('https://www.debian.org/distrib/', {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});

			const isos = [];
			const torrents = [];
			const rewriter = new HTMLRewriter()
				.on('a[href$=".iso"]', {
					element(element) {
						isos.push(element.getAttribute('href'));
					},
				})
				.on('a[href*="bt"]', {
					element(element) {
						torrents.push(element.getAttribute('href'));
					},
				});

			const _ = await rewriter.transform(res).arrayBuffer();

			return { isos: isos, torrents: torrents };
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

		let final = await step.do("coallate torrents and direct downloads", async () => {
			const final = {};
			for (const file of hrefs.isos) {
				const url = new URL(file);
				const filename = url.pathname.split('/').pop();
				const arch = filename.match(`(amd64|i386)`)[0];

				for (const torrent of torrents) {
					const torrentUrl = new URL(torrent);
					const torrentFilename = torrentUrl.pathname.split('/').pop().replace('.torrent', '');
					if (torrentFilename === filename) {
						final[filename] = { direct: url.toString(), torrent: torrentUrl.toString(), arch: arch };
					}
				}
			}

			final['version'] = Object.keys(final)[0].split('-')[1];

			return final;
		});

		await step.do("download and modify torrents", async () => {
			const torrents = Object.values(final).filter((file) => { return file.torrent !== undefined }).map((file) => {
				console.log(file);
				return file.torrent;
			})
			for (const torrent of torrents) {
				// Parse out filename from torrent URL
				const torrentUrl = new URL(torrent);
				const torrentFilename = torrentUrl.pathname.split('/').pop();

				if (await this.env.R2.get(torrentFilename) !== null) {
					console.log("torrent file already exists in r2");
					continue;
				}

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
			}
		});
	}
}
