import * as THREE from 'three';

export function setupEnvironment(scene) {
    // 1. Shared Materials (Optimization)
    const mats = {
        ground: new THREE.MeshStandardMaterial({ color: 0xcc5500, flatShading: true, roughness: 0.9 }),
        wood: new THREE.MeshStandardMaterial({ color: 0x5c3a21, flatShading: true }),
        roof: new THREE.MeshStandardMaterial({ color: 0x8b0000, flatShading: true }),
        metal: new THREE.MeshStandardMaterial({ color: 0x333333, metalShading: true, roughness: 0.7 }),
        tire: new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true }),
        glass: new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, flatShading: true }),
        leaf: new THREE.MeshStandardMaterial({ color: 0x2d6a1e, flatShading: true }),
        concrete: new THREE.MeshStandardMaterial({ color: 0x666666, flatShading: true })
    };

    // 2. Lighting & Atmosphere
    scene.fog = new THREE.FogExp2(0xff3300, 0.015); // Matches red/orange sky
    scene.background = new THREE.Color(0xff3300);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffaa00, 1.5);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -150;
    dirLight.shadow.camera.right = 150;
    dirLight.shadow.camera.top = 150;
    dirLight.shadow.camera.bottom = -150;
    scene.add(dirLight);

    // 3. Terrain / Elevation (Rolling Hills)
    const groundGeo = new THREE.PlaneGeometry(400, 400, 64, 64);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        // Sine waves + random noise for dunes
        let z = Math.sin(x * 0.05) * 4 + Math.cos(y * 0.05) * 4;
        z += Math.random() * 1.5;
        pos.setZ(i, z);
    }
    groundGeo.computeVertexNormals(); // Required for lighting to work on new hills
    const ground = new THREE.Mesh(groundGeo, mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 4. Object Creation Functions
    function createHouse(x, z) {
        const house = new THREE.Group();
        
        // Walls
        const wallGeo = new THREE.BoxGeometry(12, 10, 12);
        const walls = new THREE.Mesh(wallGeo, mats.wood);
        walls.position.y = 5;
        walls.castShadow = true;
        walls.receiveShadow = true;
        house.add(walls);

        // Roof (4-sided Cone)
        const roofGeo = new THREE.ConeGeometry(10, 6, 4);
        const roof = new THREE.Mesh(roofGeo, mats.roof);
        roof.position.y = 13;
        roof.rotation.y = Math.PI / 4; // Align with box
        roof.castShadow = true;
        roof.receiveShadow = true;
        house.add(roof);

        house.position.set(x, 0, z);
        scene.add(house);
    }

    function createCar(x, z, rotY) {
        const car = new THREE.Group();

        // Chassis
        const chassisGeo = new THREE.BoxGeometry(5, 1, 2.5);
        const chassis = new THREE.Mesh(chassisGeo, mats.metal);
        chassis.position.y = 1;
        chassis.castShadow = true;
        chassis.receiveShadow = true;
        car.add(chassis);

        // Cabin
        const cabinGeo = new THREE.BoxGeometry(2.5, 1.2, 2.2);
        const cabin = new THREE.Mesh(cabinGeo, mats.glass);
        cabin.position.set(-0.5, 2.1, 0);
        cabin.castShadow = true;
        car.add(cabin);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 8);
        wheelGeo.rotateX(Math.PI / 2); // Face forward
        const wheelPositions = [
            [-1.5, 0.6, 1.3], [1.5, 0.6, 1.3],
            [-1.5, 0.6, -1.3], [1.5, 0.6, -1.3]
        ];
        wheelPositions.forEach(p => {
            const wheel = new THREE.Mesh(wheelGeo, mats.tire);
            wheel.position.set(...p);
            wheel.castShadow = true;
            car.add(wheel);
        });

        car.position.set(x, 0, z);
        car.rotation.y = rotY;
        // Abandoned tilt
        car.rotation.z = (Math.random() - 0.5) * 0.4;
        scene.add(car);
    }

    function createBridge(x, z, length) {
        const bridge = new THREE.Group();

        // Deck
        const deckGeo = new THREE.BoxGeometry(length, 1, 6);
        const deck = new THREE.Mesh(deckGeo, mats.concrete);
        deck.position.y = 2;
        deck.castShadow = true;
        deck.receiveShadow = true;
        bridge.add(deck);

        // Railings
        const railGeo = new THREE.BoxGeometry(length, 2, 0.4);
        const rail1 = new THREE.Mesh(railGeo, mats.metal);
        rail1.position.set(0, 3.5, 2.8);
        rail1.castShadow = true;
        bridge.add(rail1);

        const rail2 = new THREE.Mesh(railGeo, mats.metal);
        rail2.position.set(0, 3.5, -2.8);
        rail2.castShadow = true;
        bridge.add(rail2);

        bridge.position.set(x, 0, z);
        scene.add(bridge);
    }

    function createTree(x, z) {
        const tree = new THREE.Group();

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 5, 5);
        const trunk = new THREE.Mesh(trunkGeo, mats.wood);
        trunk.position.y = 2.5;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        tree.add(trunk);

        // Stacked Cones for Leaves
        const coneGeo1 = new THREE.ConeGeometry(3.5, 4, 5);
        const leaves1 = new THREE.Mesh(coneGeo1, mats.leaf);
        leaves1.position.y = 5;
        leaves1.castShadow = true;
        tree.add(leaves1);

        const coneGeo2 = new THREE.ConeGeometry(2.5, 3, 5);
        const leaves2 = new THREE.Mesh(coneGeo2, mats.leaf);
        leaves2.position.y = 7;
        leaves2.castShadow = true;
        tree.add(leaves2);

        tree.position.set(x, 0, z);
        scene.add(tree);
    }

    // 5. Populate the Environment
    
    // Trees (Scattered)
    for (let i = 0; i < 40; i++) {
        const x = (Math.random() - 0.5) * 300;
        const z = (Math.random() - 0.5) * 300;
        createTree(x, z);
    }

    // Houses (3-4 placed somewhat together)
    createHouse(40, -40);
    createHouse(55, -30);
    createHouse(45, -20);
    createHouse(-60, 60);

    // Cars (3-4 randomly abandoned)
    createCar(0, 0, 0);
    createCar(20, -15, Math.PI / 4);
    createCar(-30, 10, -Math.PI / 3);
    createCar(15, 25, Math.PI);

    // Bridges
    createBridge(-50, -50, 30);
    createBridge(80, 80, 40);
}
