class App {
    uploadForm;
    filesUpload;
    statusField;
    limitToContestInput;
    mostSimilarDiv;
    rankingDiv;
    resultsDiv;

    limitToContest = false;
    contestStart = +new Date('2025-07-17T02:00:00Z');
    contestEnd = +new Date('2025-09-01T04:00:00Z');

    files;

    elws = [];
    rockies = [];

    constructor() {
        this.attach();
    }

    attach() {
        this.filesUpload = document.getElementById('files');
        this.statusField = document.getElementById('upload-status');
        this.limitToContestInput = document.getElementById('limit-to-contest');
        this.mostSimilarDiv = document.getElementById('most-similar');
        this.rankingDiv = document.getElementById('ranking');
        this.toggleResults = document.getElementById('allresults-h2');
        this.resultsDiv = document.getElementById('allresults');

        this.filesUpload.addEventListener('change', async e => {
            await this.uploadFiles();
        });

        this.limitToContestInput.addEventListener('change', async e => {
            this.limitToContest = e.target.checked;
            await this.processFiles();
        });

        this.toggleResults.addEventListener('click', e => {
            e.target.classList.toggle('opened');
            this.resultsDiv.classList.toggle('opened');
        });
    }

    async uploadFiles() {
        if (this.filesUpload.files.length > 0) {
            this.files = this.filesUpload.files;
            await this.processFiles();
        }
    }

    async readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const lines = reader.result.replaceAll('\r\n', '\n').split('\n');

                resolve(lines);
            }

            reader.onerror = () => {
                reject(`Error reading file ${file.name}`);
            }

            reader.readAsText(file);
        });
    }

    async processFiles() {
        this.elws = [];
        this.rockies = [];

        this.clearData();

        this.setStatus(`Processing ${this.files.length} files`);

        await Promise.all(Array.from(this.files, this.readFile))
            .then(results => {
                for (let lines of results) this.filterLines(lines);
            })
            .catch(err => {
                this.setStatus(err)
            });

        this.setStatus(`Filtering ${this.elws.length + this.rockies.length} results`);

        const elwhashes = [];
        this.elws = this.elws.filter(e => {
            const hash = `${e.SystemAddress}:${e.BodyID}`;
            if (elwhashes.includes(hash)) return false;

            elwhashes.push(hash);
            return true;
        });

        const rockyhashes = [];
        this.rockies = this.rockies.filter(r => {
            const hash = `${r.SystemAddress}:${r.BodyID}`;
            if (rockyhashes.includes(hash)) return false;

            rockyhashes.push(hash);
            return true;
        });

        this.rockies = this.elws.length > 0 ? this.rockies.filter(r => this.getBodyParent(r)) : [];

        this.mappedBodies = this.mapAllBodies();

        this.setStatus(`Found ${this.elws.length} Earth-like worlds and ${this.rockies.length} rocky moons`);

        document.body.classList.add('loaded');

        this.printMostSimilar();
        this.printRanking();
        this.printAll();

        console.log({ elws: this.elws, rockies: this.rockies, all: this.mappedBodies });
    }

    filterLines(lines) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].length === 0) continue;

            const line = JSON.parse(lines[i]);

            const d = +new Date(line.timestamp);

            if (this.limitToContest && (d < this.contestStart || d > this.contestEnd)) continue;
            if (!Object.hasOwn(line, 'event') || line.event !== 'Scan') continue;
            if (!Object.hasOwn(line, 'ScanType') || (line.ScanType !== 'Detailed' && line.ScanType !== 'AutoScan')) continue;
            if (!Object.hasOwn(line, 'PlanetClass')) continue;
            if (!Object.hasOwn(line, 'WasDiscovered') || line.WasDiscovered) continue;

            if (line.PlanetClass === 'Earthlike body') {
                this.elws.push(line);
                continue;
            }

            if (line.PlanetClass === 'Rocky body') {
                this.rockies.push(line);
                continue;
            }
        }
    }

    getBodyParent(body) {
        const parents = body.Parents.map(p => Object.values(p)[0]);

        return this.elws.find(e => e.SystemAddress === body.SystemAddress && parents.includes(e.BodyID));
    }

    getMoons(body) {
        return this.rockies.filter(r => {
            const parent = this.getBodyParent(r);
            if (parent && parent.SystemAddress === body.SystemAddress) return r;
        });
    }

    // https://en.wikipedia.org/wiki/Earth_Similarity_Index
    calcESI(value, compareValue) {
        return 1 - (Math.abs(value - compareValue) / Math.abs(value + compareValue));
    }

    calcOverallSimilarity(body, comparison) {
        const massESI = this.calcESI(body.mass, comparison.mass);
        const gravityESI = this.calcESI(body.gravity, comparison.gravity);
        const radiusESI = this.calcESI(body.radius, comparison.radius);
        const orbitalPeriodESI = this.calcESI(body.orbitalPeriod, comparison.orbitalPeriod);

        if (comparison.name === 'Earth') {
            const rotationPeriodESI = this.calcESI(body.rotationPeriod, comparison.rotationPeriod);
            const temperatureESI = this.calcESI(body.temperature, comparison.temperature);
            const eccentricityESI = this.calcESI(body.eccentricity, comparison.eccentricity);
            const pressureESI = this.calcESI(body.pressure, comparison.pressure);
            const oxygenESI = this.calcESI(body.oxygen, comparison.oxygen);
            const tiltESI = this.calcESI(body.tilt, comparison.tilt);

            return Math.pow(massESI * gravityESI * radiusESI * orbitalPeriodESI * rotationPeriodESI * temperatureESI * eccentricityESI * pressureESI * oxygenESI * tiltESI, 0.1);
        }

        return Math.pow(massESI * gravityESI * radiusESI * orbitalPeriodESI, 0.25);
    }

    getEarthValues() {
        return {
            name: 'Earth',
            mass: 1,
            gravity: 1,
            radius: 6378,
            temperature: 287.91,
            orbitalPeriod: 365.256,
            rotationPeriod: 1,
            eccentricity: 0.0167,
            pressure: 1,
            oxygen: 20.9,
            tilt: 23.439
        }
    }

    getMoonValues() {
        return {
            name: 'Moon',
            mass: 0.0123,
            gravity: 0.165,
            radius: 1738,
            orbitalPeriod: 27.322
        }
    }

    mapBodyValues(body, isELW = false) {
        const mapped = {
            name: body.BodyName,
            mass: body.MassEM,
            gravity: body.SurfaceGravity / 9.8,
            radius: body.Radius / 1000,
            temperature: body.SurfaceTemperature,
            orbitalPeriod: Math.abs(body.OrbitalPeriod) / 60 / 60 / 24,
            rotationPeriod: Math.abs(body.RotationPeriod) / 60 / 60 / 24,
            eccentricity: body.Eccentricity,
            pressure: body.SurfacePressure / 101325,
            oxygen: body.AtmosphereComposition?.find(c => c.Name === 'Oxygen')?.Percent || 0,
            tilt: Math.abs(body.AxialTilt) / (Math.PI / 180)
        }

        if (isELW) {
            const earth = this.getEarthValues();

            mapped.esi = {
                mass: this.calcESI(mapped.mass, earth.mass),
                gravity: this.calcESI(mapped.gravity, earth.gravity),
                radius: this.calcESI(mapped.radius, earth.radius),
                temperature: this.calcESI(mapped.temperature, earth.temperature),
                orbitalPeriod: this.calcESI(mapped.orbitalPeriod, earth.orbitalPeriod),
                rotationPeriod: this.calcESI(mapped.rotationPeriod, earth.rotationPeriod),
                eccentricity: this.calcESI(mapped.eccentricity, earth.eccentricity),
                pressure: this.calcESI(mapped.pressure, earth.pressure),
                oxygen: this.calcESI(mapped.oxygen, earth.oxygen),
                tilt: this.calcESI(mapped.tilt, earth.tilt),
                overall: this.calcOverallSimilarity(mapped, earth)
            }
        } else {
            const moon = this.getMoonValues();

            mapped.esi = {
                mass: this.calcESI(mapped.mass, moon.mass),
                gravity: this.calcESI(mapped.gravity, moon.gravity),
                radius: this.calcESI(mapped.radius, moon.radius),
                orbitalPeriod: this.calcESI(mapped.orbitalPeriod, moon.orbitalPeriod),
            }
        }

        return mapped;
    }

    mapAllBodies() {
        const bodies = [];

        for (let i = 0; i < this.elws.length; i++) {
            const moon = this.getMoons(this.elws[i]).map(m => this.mapBodyValues(m))[0];

            const body = {
                name: this.elws[i].BodyName,
                original: this.elws[i],
                mapped: this.mapBodyValues(this.elws[i], true),
            }

            if (moon) body.moon = moon;

            bodies.push(body);
        }

        return bodies;
    }

    findClosest(key, isELW = false) {
        const bodies = isELW ? this.mappedBodies.map(b => b.mapped) : this.mappedBodies.filter(b => Object.hasOwn(b, 'moon')).map(b => b.moon);

        bodies.sort((a, b) => b.esi[key] - a.esi[key]);

        return bodies[0];
    }

    clearData() {
        [
            ...this.mostSimilarDiv.children,
            ...this.rankingDiv.children,
            ...this.resultsDiv.children
        ].forEach(c => c.parentElement.removeChild(c));
    }

    printMostSimilar() {
        const earth = this.getEarthValues();
        const moon = this.getMoonValues();

        const similarELWs = this.mappedBodies.map(b => {
            return {
                name: b.name,
                similarity: this.calcOverallSimilarity(b.mapped, earth)
            }
        }).sort((a, b) => b.similarity - a.similarity);

        const elwDiv = document.createElement('div');
        elwDiv.innerHTML = `<label>Most similar ELW:</label><span>${similarELWs[0].name} (ESI ${similarELWs[0].similarity.toFixed(3)})</span>`;
        this.mostSimilarDiv.appendChild(elwDiv);

        const similarMoons = this.mappedBodies.filter(b => Object.hasOwn(b, 'moon')).map(b => {
            return {
                name: b.moon.name,
                similarity: this.calcOverallSimilarity(b.moon, moon)
            }
        }).sort((a, b) => b.similarity - a.similarity);

        if (similarMoons.length > 0) {
            const moonDiv = document.createElement('div');
            moonDiv.innerHTML = `<label>Most similar moon:</label><span>${similarMoons[0].name} (ESI ${similarMoons[0].similarity.toFixed(3)})</span>`;
            this.mostSimilarDiv.appendChild(moonDiv);
        }
    }

    printRanking() {
        const earth = this.getEarthValues();
        const moon = this.getMoonValues();

        const [table, thead, tbody] = ['table', 'thead', 'tbody'].map(el => document.createElement(el));

        ['Criterium', 'Body', 'Value', 'Earth value', 'ESI'].map(h => {
            const th = document.createElement('th');
            th.innerText = h;
            thead.appendChild(th)
        });
        table.appendChild(thead);

        const [mass, gravity, radius, temp, orbPeriod, ecc, rotPeriod, pressure, oxygen, tilt] =
            ['mass', 'gravity', 'radius', 'temperature', 'orbitalPeriod', 'eccentricity', 'rotationPeriod', 'pressure', 'oxygen', 'tilt'].map(v => this.findClosest(v, true));

        const [moonMass, moonGravity, moonRadius, moonOrbPeriod] = ['mass', 'gravity', 'radius', 'orbitalPeriod'].map(v => this.findClosest(v));

        tbody.appendChild(this.getRankingRow('Mass', mass.name, mass.mass.toFixed(2), earth.mass.toFixed(2), mass.esi.mass, ' EM'));
        tbody.appendChild(this.getRankingRow('Gravity', gravity.name, gravity.gravity.toFixed(2), earth.gravity.toFixed(2), gravity.esi.gravity, ' G'));
        tbody.appendChild(this.getRankingRow('Radius', radius.name, radius.radius.toFixed(0), earth.radius.toFixed(0), radius.esi.radius, ' km'));
        tbody.appendChild(this.getRankingRow('Temperature', temp.name, temp.temperature.toFixed(2), earth.temperature.toFixed(2), temp.esi.temperature, ' K'));
        tbody.appendChild(this.getRankingRow('Orbital period', orbPeriod.name, orbPeriod.orbitalPeriod.toFixed(3), earth.orbitalPeriod.toFixed(3), orbPeriod.esi.orbitalPeriod, ' days'));
        tbody.appendChild(this.getRankingRow('Eccentricity', ecc.name, ecc.eccentricity.toFixed(4), earth.eccentricity.toFixed(4), ecc.esi.eccentricity));
        tbody.appendChild(this.getRankingRow('Rotation period', rotPeriod.name, rotPeriod.rotationPeriod.toFixed(2), earth.rotationPeriod.toFixed(2), rotPeriod.esi.rotationPeriod, ' days'));
        tbody.appendChild(this.getRankingRow('Pressure', pressure.name, pressure.pressure.toFixed(2), earth.pressure.toFixed(2), pressure.esi.pressure, ' atm'));
        tbody.appendChild(this.getRankingRow('Oxygen', oxygen.name, oxygen.oxygen.toFixed(2), earth.oxygen.toFixed(2), oxygen.esi.oxygen, '%'));
        tbody.appendChild(this.getRankingRow('Tilt', tilt.name, tilt.tilt.toFixed(3), earth.tilt.toFixed(3), tilt.esi.tilt, '°'));

        tbody.appendChild(this.getRankingRow('Moon mass', moonMass.name, moonMass.mass.toFixed(4), moon.mass.toFixed(4), moonMass.esi.mass, ' EM'));
        tbody.appendChild(this.getRankingRow('Moon gravity', moonGravity.name, moonGravity.gravity.toFixed(2), moon.gravity.toFixed(2), moonGravity.esi.gravity, ' G'));
        tbody.appendChild(this.getRankingRow('Moon radius', moonRadius.name, moonRadius.radius.toFixed(0), moon.radius.toFixed(0), moonRadius.esi.radius, ' km'));
        tbody.appendChild(this.getRankingRow('Moon orbital period', moonOrbPeriod.name, moonOrbPeriod.orbitalPeriod.toFixed(3), moon.orbitalPeriod.toFixed(3), moonOrbPeriod.esi.orbitalPeriod, ' days'));

        table.appendChild(tbody);
        this.rankingDiv.appendChild(table);
    }

    getRankingRow(criterium, body, rawvalue, earthvalue, esi, suffix = '') {
        const tr = document.createElement('tr');
        const [tdC, tdB, tdV, tdE, tdI] = ['td', 'td', 'td', 'td', 'td'].map(td => document.createElement(td));

        tdC.innerText = criterium;
        tr.appendChild(tdC);
        tdB.innerText = body;
        tr.appendChild(tdB);
        tdV.innerText = `${rawvalue}${suffix}`;
        tr.appendChild(tdV);
        tdE.innerText = `${earthvalue}${suffix}`;
        tr.appendChild(tdE);
        tdI.innerText = esi.toFixed(3);
        tr.appendChild(tdI);

        return tr;
    }

    printAll() {
        const [table, thead, tbody] = ['table', 'thead', 'tbody'].map(el => document.createElement(el));

        ['Date', 'Body name', 'Mass', 'Gravity', 'Radius', 'Temperature', 'Orbital period', 'Eccentricity', 'Rotation period', 'Pressure', 'Oxygen in atmosphere', 'Tilt', 'Moon name', 'Moon mass', 'Moon gravity', 'Moon radius', 'Moon orbital period'].forEach(h => {
            const th = document.createElement('th');
            th.innerText = h;
            thead.appendChild(th)
        });
        table.appendChild(thead);

        this.mappedBodies.forEach(b => {
            const tr = document.createElement('tr');

            const [
                tdTS, tdName, tdMass, tdGrav, tdRad, tdTemp, tdOrbPeriod,
                tdEcc, tdRotPeriod, tdPressure, tdOxyAtmos, tdTilt,
                tdMoonName, tdMoonMass, tdMoonGrav, tdMoonRad, tdMoonOrbPeriod
            ] = new Array(17).fill().map(_ => document.createElement('td'));

            tdTS.innerText = new Date(b.original.timestamp).toISOString().replace('T', ' ').replace('.000Z', '');
            tdName.innerText = b.mapped.name;
            tdMass.innerText = b.mapped.mass.toFixed(2);
            tdGrav.innerText = b.mapped.gravity.toFixed(2);
            tdRad.innerText = `${b.mapped.radius.toFixed(0)} km`;
            tdTemp.innerText = `${b.mapped.temperature.toFixed(2)} K`;
            tdOrbPeriod.innerText = `${b.mapped.orbitalPeriod.toFixed(3)} days`;
            tdEcc.innerText = b.mapped.eccentricity.toFixed(4);
            tdRotPeriod.innerText = `${b.mapped.rotationPeriod.toFixed(2)} days`;
            tdPressure.innerText = `${b.mapped.pressure.toFixed(2)} atm`;
            tdOxyAtmos.innerText = `${b.mapped.oxygen.toFixed(2)}%`;
            tdTilt.innerText = `${b.mapped.tilt.toFixed(3)}°`;

            if (Object.hasOwn(b, 'moon')) {
                tdMoonName.innerText = b.moon.name;
                tdMoonMass.innerText = b.moon.mass.toFixed(4);
                tdMoonGrav.innerText = b.moon.gravity.toFixed(3);
                tdMoonRad.innerText = `${b.moon.radius.toFixed(0)} km`;
                tdMoonOrbPeriod.innerText = `${b.moon.orbitalPeriod.toFixed(3)} days`;
            }

            [
                tdTS, tdName, tdMass, tdGrav, tdRad, tdTemp, tdOrbPeriod,
                tdEcc, tdRotPeriod, tdPressure, tdOxyAtmos, tdTilt,
                tdMoonName, tdMoonMass, tdMoonGrav, tdMoonRad, tdMoonOrbPeriod
            ].forEach(td => tr.appendChild(td));

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this.resultsDiv.appendChild(table);
    }

    setStatus(message) {
        this.statusField.innerHTML = message;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new App();
});
