import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phone = TextEditingController(text: '+221');
  final _code = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final ctrl = ref.read(authControllerProvider.notifier);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 48),
              const Text('Newdem',
                  style: TextStyle(fontSize: 40, fontWeight: FontWeight.w800, color: NewdemColors.teal)),
              const Text('On passe vous prendre.',
                  style: TextStyle(color: NewdemColors.accent, fontStyle: FontStyle.italic)),
              const SizedBox(height: 40),
              if (!auth.codeSent) ...[
                const Text('Votre numéro de téléphone', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                TextField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: _dec('+221 77 000 00 00'),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: auth.loading ? null : () => ctrl.requestOtp(_phone.text.trim()),
                  child: auth.loading ? _spinner() : const Text('Recevoir le code'),
                ),
              ] else ...[
                Text('Code envoyé au ${_phone.text.trim()}', style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                TextField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  decoration: _dec('Code à 6 chiffres'),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: auth.loading ? null : () => ctrl.verifyOtp(_phone.text.trim(), _code.text.trim()),
                  child: auth.loading ? _spinner() : const Text('Se connecter'),
                ),
              ],
              if (auth.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: Text(auth.error!, style: const TextStyle(color: NewdemColors.accent)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        filled: true,
        fillColor: NewdemColors.sand,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      );

  Widget _spinner() => const SizedBox(
      height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white));
}
