class App {
    uploadForm;
    filesUpload;
    statusField;
    limitToContestInput;
    resultsDiv;

    limitToContest = false;
    contestStart = +new Date('2025-07-01T00:00:00Z');
    contestEnd = +new Date('2025-08-31T00:00:00Z');

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
        this.resultsDiv = document.getElementById('results');

        this.filesUpload.addEventListener('change', async e => {
            await this.uploadFiles();
        });

        this.limitToContestInput.addEventListener('change', async e => {
            this.limitToContest = e.target.checked;
            await this.processFiles();
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

        this.setStatus(`Found ${this.elws.length} Earth-like worlds and ${this.rockies.length} rocky moons`);

        this.printFindings();

        console.log({ elws: this.elws, rockies: this.rockies });
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
        return (1 - ((compareValue - value) / (compareValue + value))).toFixed(2);
    }

    calcOverallSimilarity(body, comparison) {
        const massESI = this.calcESI(body.mass, comparison.mass);
        const gravityESI = this.calcESI(body.gravity, comparison.gravity);
        const radiusESI = this.calcESI(body.radius, comparison.radius);
        const orbitalPeriodESI = this.calcESI(body.orbitalPeriod, comparison.orbitalPeriod);

        if (comparison.name === 'Earth') {
            const rotationalPeriodESI = this.calcESI(body.rotationalPeriod, comparison.rotationalPeriod);
            const temperatureESI = this.calcESI(body.temperature, comparison.temperature);
            const eccentricityESI = this.calcESI(body.eccentricity, comparison.eccentricity);
            const pressureESI = this.calcESI(body.pressure, comparison.pressure);
            const oxygenESI = this.calcESI(body.oxygen, comparison.oxygen);
            const tiltESI = this.calcESI(body.tilt, comparison.tilt);

            return Math.pow(massESI * gravityESI * radiusESI * orbitalPeriodESI * rotationalPeriodESI * temperatureESI * eccentricityESI * pressureESI * oxygenESI * tiltESI, 0.1);
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
            tilt: 0.4014
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

    mapBodyValues(body) {
        return {
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
            tilt: body.AxialTilt
        }
    }

    printFindings() {
        [...this.resultsDiv.children].forEach(c => c.parentElement.removeChild(c));

        const [table, thead, tbody] = ['table', 'thead', 'tbody'].map(el => document.createElement(el));

        ['Body name', 'Mass', 'Gravity', 'Radius', 'Temperature', 'Orbital period', 'Eccentricity', 'Rotation period', 'Pressure', 'Oxygen in atmosphere', 'Tilt', 'Moon name', 'Moon mass', 'Moon gravity', 'Moon radius', 'Moon orbital period'].forEach(h => {
            const th = document.createElement('th');
            th.innerText = h;
            thead.appendChild(th)
        });
        table.appendChild(thead);

        const earth = this.getEarthValues();

        this.elws.forEach(e => {
            const body = this.mapBodyValues(e);
            const moons = this.getMoons(e);

            const tr = document.createElement('tr');

            const [
                tdName, tdMass, tdGrav, tdRad, tdTemp, tdOrbPeriod,
                tdEcc, tdRotPeriod, tdPressure, tdOxyAtmos, tdTilt,
                tdMoonName, tdMoonMass, tdMoonGrav, tdMoonRad, tdMoonOrbPeriod
            ] = new Array(16).fill().map(_ => document.createElement('td'));

            tdName.innerText = body.name;
            tdMass.innerText = `${body.mass.toFixed(2)} (${this.calcESI(body.mass, earth.mass)})`;
            tdGrav.innerText = `${body.gravity.toFixed(2)} (${this.calcESI(body.gravity, earth.gravity)})`;
            tdRad.innerText = `${body.radius.toFixed(0)} km`;
            tdTemp.innerText = `${body.temperature.toFixed(2)} K`;
            tdOrbPeriod.innerText = `${body.orbitalPeriod.toFixed(3)} Days`;
            tdEcc.innerText = `${body.eccentricity.toFixed(4)}`;
            tdRotPeriod.innerText = `${body.rotationPeriod.toFixed(2)} Days`;
            tdPressure.innerText = `${body.pressure.toFixed(2)} atm`;
            tdOxyAtmos.innerText = `${body.oxygen.toFixed(2)}%`;
            tdTilt.innerText = `${body.tilt.toFixed(3)}°`;

            if (moons.length > 0) {
                const moon = this.mapBodyValues(moons[0]);

                tdMoonName.innerText = moon.name;
                tdMoonMass.innerText = moon.mass.toFixed(2);
                tdMoonGrav.innerText = moon.gravity.toFixed(3);
                tdMoonRad.innerText = `${moon.radius.toFixed(0)} km`;
                tdMoonOrbPeriod.innerText = `${moon.orbitalPeriod.toFixed(3)} Days`;
            }

            [
                tdName, tdMass, tdGrav, tdRad, tdTemp, tdOrbPeriod,
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
