import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage, Float, Environment, useGLTF } from '@react-three/drei';
import type { BodyMetrics } from '../lib/bodyComposition';
import type { Gender } from '../types';
import * as THREE from 'three';

interface Props {
    metrics: BodyMetrics;
    gender: Gender;
}

const MODEL_PATH = '/niume/assets/male__female_base_mesh_pack.glb';

const BodyMesh: React.FC<Props> = ({ metrics, gender }) => {
    const { nodes, materials } = useGLTF(MODEL_PATH) as any;
    const meshRef = useRef<THREE.Group>(null);
    const isMale = gender === 'male' || gender === 'other';

    // Log nodes to help identify which mesh to show and check for morph targets
    useEffect(() => {
        console.log('--- 3D Model Technical Inspection ---');
        Object.entries(nodes).forEach(([name, node]: [string, any]) => {
            if (node.isMesh) {
                console.log(`Mesh: ${name}`);
                if (node.morphTargetDictionary) {
                    console.log(`  Morph Targets identified for ${name}:`, Object.keys(node.morphTargetDictionary));
                } else {
                    console.log(`  No Morph Targets found for ${name}`);
                }
                if (node.skeleton) {
                    console.log(`  Skeleton found for ${name} with ${node.skeleton.bones.length} bones`);
                }
            }
        });
        console.log('------------------------------------');
    }, [nodes]);

    // Scales for morphing
    const s = metrics.shoulderScale;
    const w = metrics.waistScale;
    const m = metrics.muscularity;

    // Animation loop for subtle breathing/movement
    useFrame((state) => {
        if (!meshRef.current) return;
        meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    });

    // Strategy: Try to find meshes that contain 'male' or 'female' in their names
    const maleNodes = Object.values(nodes).filter((n: any) => n.isMesh && n.name.toLowerCase().includes('male') && !n.name.toLowerCase().includes('female'));
    const femaleNodes = Object.values(nodes).filter((n: any) => n.isMesh && n.name.toLowerCase().includes('female'));

    // Fallback if naming is different: just show the first mesh found
    const activeNodes = isMale
        ? (maleNodes.length > 0 ? maleNodes : Object.values(nodes).filter((n: any) => n.isMesh).slice(0, 1))
        : (femaleNodes.length > 0 ? femaleNodes : Object.values(nodes).filter((n: any) => n.isMesh).slice(1, 2));

    return (
        <group ref={meshRef}>
            {activeNodes.map((node: any) => (
                <mesh
                    key={node.name}
                    geometry={node.geometry}
                    material={materials[Object.keys(materials)[0]] || new THREE.MeshStandardMaterial({ color: 'var(--primary)' })}
                    scale={[
                        isMale ? s * (1.1 + m * 0.1) : s * 0.9,
                        1,
                        w * (0.8 + (1 - m) * 0.1)
                    ]}
                >
                    <meshStandardMaterial
                        color="var(--primary)"
                        roughness={0.3}
                        metalness={0.4}
                        emissive="var(--primary)"
                        emissiveIntensity={0.05 + m * 0.15}
                    />
                </mesh>
            ))}
        </group>
    );
};

export const ThreeBodyVisualizer: React.FC<Props> = (props) => {
    return (
        <div className="w-full h-[350px] relative rounded-3xl overflow-hidden bg-gradient-to-b from-card to-bg-main border border-white/5 shadow-2xl">
            <Canvas shadows camera={{ position: [0, 0, 5], fov: 40 }}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} />

                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.5}>
                        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.4}>
                            <BodyMesh {...props} />
                        </Float>
                    </Stage>
                </Suspense>

                <OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 2.2} maxPolarAngle={Math.PI / 1.8} />
                <Environment preset="night" />
            </Canvas>

            <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-3 py-1 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-[10px] font-bold text-white tracking-widest uppercase">3D REALTIME</span>
                </div>
            </div>
        </div>
    );
};

useGLTF.preload(MODEL_PATH);
