# Instrument recordings

ChartAloud bundles a small set of real, locally served instrument recordings. The browser loads only the instruments used in the current playback.

- Grand piano: University of Iowa Electronic Music Studios (Steinway grand, MIS). Source: https://theremin.music.uiowa.edu/MISpiano.html . The source permits use in projects without restrictions, as recorded in the Keyboardia manifest.
- Acoustic guitar: Discord GM Bank, Martin HD28 Steel String (Jeff Learman), CC0 1.0. Source: https://github.com/sfzinstruments/Discord-SFZ-GM-Bank .
- Marimba, vibraphone, kalimba: Versilian Community Sample Library (VCSL), CC0 1.0. Source: https://github.com/sgossner/VCSL .
- Clean electric guitar: Karoryfer Black and Green Guitars, CC0 1.0. Source: https://github.com/sfzinstruments/karoryfer.black-and-green-guitars .
- String ensemble: VSCO 2 Community Edition, CC0 1.0. Source: https://github.com/sgossner/VSCO-2-CE .
- Hammond organ: FreePats setBfree, CC0 1.0. Source: https://freepats.zenvoid.org/Organ/electric-organ.html .

The eight sets above are redistributed from [Keyboardia](https://github.com/adewale/keyboardia), with their pitch mappings and source credits preserved in each `manifest.json`.

- Flute and harp: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), edited from VSO2 samples, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Attribution: Nicholaus P. Brosowsky, Versilian Studios and the original sample authors; see upstream `sample-source-info.txt`.

Each sample is a recording of the named instrument; playback adjusts the nearest recorded pitch to the requested note. Other than the sample files, no music or CSV data is fetched from a server.

## Expanded instrument set

- Electric bass, saxophone, trumpet, violin, xylophone, and cello: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Attribution: Nicholaus P. Brosowsky and the original sample authors. The upstream [sample source list](https://github.com/nbrosowsky/tonejs-instruments/blob/master/sample-source-info.txt) identifies Karoryfer (bass and saxophone), VSO2 / Versilian Studios (trumpet, violin, xylophone), and Freesound contributor `flcellogrl` (cello). The bundled files are a subset of those edited recordings.

## Nature sounds

The optional environmental tracks are local MP3 transcodes of Wikimedia Commons recordings. They play only in music mode and never encode a CSV value.

- Soft rain: [Rain.ogg](https://commons.wikimedia.org/wiki/File:Rain.ogg), recorded by ジダネ, dedicated to the public domain by its author.
- Wind chimes: [Windglockenspiel.Koshi.ogg](https://commons.wikimedia.org/wiki/File:Windglockenspiel.Koshi.ogg), recorded by Membeth, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- Flowing water: [Flowing-water-100019.ogg](https://commons.wikimedia.org/wiki/File:Flowing-water-100019.ogg), recorded by Fg2, dedicated to the public domain by its author.
