// Test bundle: exposes Look and three.js for dev/harness/test_look_edges.py
import * as THREE from 'three';
import { Look } from '../../../src/look';
(window as any).THREE = THREE;
(window as any).Look = Look;
