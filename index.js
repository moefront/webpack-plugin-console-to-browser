/**
 * Transport logs from webpack console to browser console
 * 
 * Usage: in webpack.config.js:
 * 
 * const ConsoleToBrowserPlugin = require('webpack-plugin-console-to-browser')
 * plugins: [
 * 	new ConsoleToBrowserPlugin()
 * ]
 */
module.exports = class ConsoleToBrowserPlugin {

	constructor() {
		this.connPool = [];
	}

	buildScript() {
		return [
			'',
			'',
			'// webpack-plugin-console-to-browser bootstrap',
			'(function() {',
			'  if (typeof window == "undefined") return;',
			'  var scriptDom = document.createElement("script");',
			'  scriptDom.setAttribute("type", "text/javascript");',
			'  scriptDom.setAttribute("src", "http://localhost:23233/assistant.js");',
			'  document.body.appendChild(scriptDom);',
			'})()'
		].join('\n');
	}

	initServer() {
		const http = require('http'),
					handler = http.createServer();

		// start express for downloading script
		const express = require('express'),
					app = express();
		app.get('/assistant.js', (req, res) => {
			const fs = require('fs');
			const script = fs.readFileSync(__dirname + '/client/assistant.js');

			res.send(script);
			res.end();
		});
		app.listen(23233);		// default port of express is 23233

		// start sockjs server
		const sockjs = require('sockjs'),
					sockServer = sockjs.createServer({
						sockjs_url: 'http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js'
					});
		sockServer.on('connection', (conn) => {
			if (!conn)
				return;

			this.connPool.push(conn);

			// destroy
			conn.on('close', () => {
				const connIndex = this.connPool.indexOf(conn);
				if (connIndex > 0) {
					this.connPool.splice(connIndex, 1);
				}
			});

		});
		sockServer.installHandlers(handler, { prefix: '/sockjs-node' });
		handler.listen(56867);			// default port of sockjs is 56867
	}

	sockWrite(type, data) {
		const items = this.connPool,
					stripAnsi = require('strip-ansi');

		for (const i in data)
		{
			data[i] = stripAnsi(data[i]);
		}

		items.forEach(item => {
			item.write(JSON.stringify({
				type: type,
				data: data
			}));
		});
	}

	injectScript(compilation) {
		compilation.mainTemplate.plugin('startup', (source) => {
			console.log('\nInjecting console-to-browser script to bundle...');
			return this.buildScript() + source;
		});
	}

	sendWarnings(warnings) {
		this.sockWrite('warnings', warnings);
	}

	sendErrors(errors) {
		this.sockWrite('errors', errors);
	}

	onBuildCompleted(stats) {
		const statsJson = stats.toJson({
			errorDetails: false
		});

		this.sendWarnings(statsJson.warnings);
		this.sendErrors(statsJson.errors);
	}

	apply(compiler) {
		this.initServer();

		compiler.plugin('compilation', this.injectScript.bind(this));
		compiler.plugin('done', this.onBuildCompleted.bind(this));
	}

};
