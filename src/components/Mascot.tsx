import React from 'react';
import { motion } from 'framer-motion';

export type MascotPose = 'neutral' | 'happy' | 'thinking' | 'waiting' | 'workout';

interface MascotProps {
    pose?: MascotPose;
    size?: number | string;
    className?: string;
    bust?: boolean;
}

const Mascot: React.FC<MascotProps> = ({ pose = 'neutral', size = 150, className = "", bust = false }) => {
    // Ajuste do viewBox para o modo busto (foca na cabeça/olhos)
    // O mascote está centralizado em x=2438, olhos em y=1933
    const viewBox = bust ? "1600 700 1600 1600" : "0 0 4877 3599";
    const eyeVariantsLeft = {
        neutral: { scaleY: 1, y: 0, d: "M2180,1950 q50,-60 100,0" },
        happy: { scaleY: 0.8, y: 5, d: "M2180,1950 q50,-60 100,0" },
        thinking: { y: -5, rotate: -5, d: "M2180,1950 q50,-60 100,0" },
        waiting: { scaleY: [1, 0.1, 1], d: "M2180,1950 q50,-60 100,0", transition: { repeat: Infinity, duration: 3, times: [0, 0.1, 0.2] } },
        workout: { scaleY: 1.1, y: 2, d: "M2180,1950 q50,-60 100,0" }
    };

    const eyeVariantsRight = {
        neutral: { scaleY: 1, y: 0, d: "M2500,1950 q50,-60 100,0" },
        happy: { scaleY: 0.8, y: 5, d: "M2500,1950 q50,-60 100,0" },
        thinking: { y: -5, rotate: 5, d: "M2500,1950 q50,-60 100,0" },
        waiting: { scaleY: [1, 0.1, 1], d: "M2500,1950 q50,-60 100,0", transition: { repeat: Infinity, duration: 3, times: [0, 0.1, 0.2] } },
        workout: { scaleY: 1.1, y: 2, d: "M2500,1950 q50,-60 100,0" }
    };

    const mouthVariants = {
        neutral: { scaleX: 1, scaleY: 1, d: "M7400,2275 q150,120 300,0" },
        happy: { scaleX: 1.1, scaleY: 1.2, d: "M7400,2275 q150,160 300,0" },
        thinking: { scaleX: 0.8, d: "M7400,2275 q150,20 300,0" },
        workout: { scaleX: 1.05, d: "M7400,2275 q150,140 300,0" },
        waiting: { scaleX: 1, scaleY: 0.95, d: "M7400,2275 q150,110 300,0" }
    };

    const bodyVariants = {
        neutral: { scale: 1, rotate: 0, y: 0 },
        happy: { scale: 1.05, y: -5, rotate: [0, -2, 2, 0], transition: { repeat: Infinity, duration: 2 } },
        thinking: { scale: 1, y: 0, rotate: -3 },
        waiting: { scale: [1, 1.02, 1], rotate: 0, y: 0, transition: { repeat: Infinity, duration: 4 } },
        workout: { scale: [1, 1.05, 1], rotate: 0, y: 0, transition: { repeat: Infinity, duration: 0.8 } }
    };

    const armLeftVariants = {
        neutral: { rotate: 0, d: "M6811,2110s-326.01,54.44-190-298" },
        happy: { rotate: [-10, 10, -10], d: "M6811,2110s-326.01,54.44-190-298", transition: { repeat: Infinity, duration: 1 } },
        thinking: { rotate: -15, d: "M6811,2110s-326.01,54.44-190-298" },
        waiting: { rotate: 0, d: "M6811,2110s-326.01,54.44-190-298" },
        workout: { rotate: [-20, 20, -20], d: "M6811,2110s-326.01,54.44-190-298", transition: { repeat: Infinity, duration: 0.5 } }
    };

    const armRightVariants = {
        neutral: { rotate: 0, d: "M8092,2067s201.2,15.5,125-277" },
        happy: { rotate: [10, -10, 10], d: "M8092,2067s201.2,15.5,125-277", transition: { repeat: Infinity, duration: 1 } },
        thinking: { rotate: 0, d: "M8092,2067s201.2,15.5,125-277" },
        waiting: { rotate: 5, d: "M8092,2067s201.2,15.5,125-277" },
        workout: { rotate: [20, -20, 20], d: "M8092,2067s201.2,15.5,125-277", transition: { repeat: Infinity, duration: 0.5 } }
    };

    return (
        <motion.div
            className={`relative flex items-center justify-center overflow-hidden ${className}`}
            style={{ width: size, height: size }}
            animate={pose}
        >
            <svg
                viewBox={viewBox}
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full drop-shadow-xl"
            >
                <defs>
                    <style>{`
                        .mascot-cls-1 { fill: #e4ff90; }
                        .mascot-cls-1, .mascot-cls-2, .mascot-cls-3, .mascot-cls-4, .mascot-cls-5, .mascot-cls-6, .mascot-cls-8 { fill-rule: evenodd; }
                        .mascot-cls-2 { fill: #7d5322; }
                        .mascot-cls-3 { fill: #889d3a; }
                        .mascot-cls-4 { fill: #ecffb2; }
                        .mascot-cls-5 { fill: #4e3262; }
                        .mascot-cls-6 { fill: #bd8ede; }
                        .mascot-cls-7 { font-size: 100px; fill: #262626; font-family: 'Quicksand', sans-serif; font-weight: 600; }
                        .mascot-cls-8 { fill: none; stroke: #262626; stroke-linecap: round; stroke-width: 40px; }
                    `}</style>
                </defs>

                <motion.g variants={bodyVariants}>
                    {/* Shadow / Base */}
                    <path className="mascot-cls-1" d="M7461,1034s-296.44-39.776-382.84,449.92c-59.95,176.86-220.08,386.58-220.08,386.58s-174.37,267.38,23.15,608.85c197.91,342.12,530,241.74,530,241.74a331.318,331.318,0,0,1,60.26-5.92" transform="translate(-4977)" />
                    <path className="mascot-cls-1" d="M7456.74,1028.78s298.11-38.055,387.68,464.56c60.55,179.74,219.48,391.12,219.48,391.12s171.34,266.86-21.73,601.93c-191.15,331.73-514.66,234.1-514.66,234.1a325.4,325.4,0,0,0-58.74-5.84" transform="translate(-4977)" />

                    {/* Hair / Top details */}
                    <path className="mascot-cls-2" d="M7484,1085s-8.35,20.26-36,6c0,0-39.53-197.234,80-322,0,0,8.1-18.209,33,1,0,0,24.51,14.212,38,30,0,0,13.22,6.8-9,27,0,0-105.19,95.323-106,242v8l1,4Z" transform="translate(-4977)" />
                    <path className="mascot-cls-3" d="M7555,1085s-69.43,54.21-177-1c0,0-19.13-8.05,0,9,0,0,82.38,65.28,182,0,0,0,11.98-9.25,1-10a4.909,4.909,0,0,0-5,1Z" transform="translate(-4977)" />

                    {/* Side details */}
                    <path className="mascot-cls-4" d="M7265,1276s-46.24,147.02-48,206-64.41,148.23-78,62,48-228,48-228l44-39,29-11Z" transform="translate(-4977)" />
                    <path className="mascot-cls-4" d="M8093,2247s15.75,258.05-294,397-170.57-71.81,13-114,221.27-161.05,232-338,42,26,42,26Z" transform="translate(-4977)" />

                    {/* Face Base */}
                    <path className="mascot-cls-5" d="M7180,1177s-20.53-1.5-30,20-36.12,51.24-55,169c0,0-13.73,23.94,29,25,0,0,350.72,14.95,688-4,0,0,17.5,2.62,18-30,0,0-4.4-96.7-68-176,0,0-5.14-7.29-24-4,0,0-258.91,28.18-539,1h-10Z" transform="translate(-4977)" />
                    <path className="mascot-cls-6" d="M7141,1212s-35.49,57.27-42,138c0,0,489.32,22.13,730-1,0,0,.76-53.88-45-139C7784,1210,7499.34,1230.82,7141,1212Z" transform="translate(-4977)" />

                    {/* Eyes - Left */}
                    <motion.path
                        variants={eyeVariantsLeft}
                        className="mascot-cls-8"
                        d="M2180,1950 q50,-60 100,0"
                        style={{ strokeWidth: 45 }}
                    />
                    {/* Eyes - Right */}
                    <motion.path
                        variants={eyeVariantsRight}
                        className="mascot-cls-8"
                        d="M2500,1950 q50,-60 100,0"
                        style={{ strokeWidth: 45 }}
                    />

                    {/* Arms */}
                    <motion.path variants={armLeftVariants} className="mascot-cls-8" d="M6811,2110s-326.01,54.44-190-298" transform="translate(-4977)" style={{ originX: '7100px', originY: '2100px' }} />
                    <motion.path variants={armRightVariants} className="mascot-cls-8" d="M8092,2067s201.2,15.5,125-277" transform="translate(-4977)" style={{ originX: '7800px', originY: '2000px' }} />

                    {/* Legs */}
                    <path className="mascot-cls-8" d="M7262,2701v211" transform="translate(-4977)" />
                    <path className="mascot-cls-8" d="M7674,2722l-11,196" transform="translate(-4977)" />

                    {/* Mouth / Smile */}
                    <motion.path
                        variants={mouthVariants}
                        className="mascot-cls-8"
                        d="M7400,2275 q150,120 300,0"
                        transform="translate(-4977)"
                        style={{ strokeWidth: 40 }}
                    />
                </motion.g>
            </svg>
        </motion.div>
    );
};

export default Mascot;
