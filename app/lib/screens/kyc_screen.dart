import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';

import '../core/theme.dart';
import '../state/providers.dart';

const _docLabels = {
  'id_card': "Carte d'identité (CNI)",
  'license': 'Permis de conduire',
  'registration': 'Carte grise',
  'insurance': "Attestation d'assurance",
};

const _statusLabels = {
  'pending': 'À compléter',
  'submitted': 'En cours de vérification',
  'approved': 'Validé',
  'rejected': 'Dossier rejeté',
};

/// Écran d'envoi des pièces justificatives du conducteur.
class KycScreen extends ConsumerStatefulWidget {
  const KycScreen({super.key});
  @override
  ConsumerState<KycScreen> createState() => _KycScreenState();
}

class _KycScreenState extends ConsumerState<KycScreen> {
  Map<String, dynamic>? _status;
  String? _busyKind;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = await ref.read(kycApiProvider).status();
    if (mounted) setState(() => _status = s);
  }

  Future<void> _pickAndUpload(String kind) async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
    );
    final path = res?.files.single.path;
    if (path == null) return;
    setState(() => _busyKind = kind);
    try {
      await ref.read(kycApiProvider).upload(kind, path);
      await _load();
    } catch (_) {
      _toast('Envoi impossible (format ou taille ?)');
    } finally {
      if (mounted) setState(() => _busyKind = null);
    }
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      await ref.read(kycApiProvider).submit();
      await _load();
      _toast('Dossier soumis pour vérification');
    } catch (_) {
      _toast('Pièces manquantes');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final docs = (status?['documents'] as List?) ?? [];
    final allUploaded = ((status?['missing'] as List?) ?? const [null]).isEmpty;
    final kyc = status?['kycStatus'] as String? ?? 'pending';

    return Scaffold(
      appBar: AppBar(title: const Text('Vérification du profil')),
      body: status == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(18),
              children: [
                _banner(kyc),
                const SizedBox(height: 16),
                const Text('Pièces requises', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                for (final d in docs) _docTile(d as Map<String, dynamic>),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: (!allUploaded || kyc == 'submitted' || _submitting) ? null : _submit,
                  child: _submitting
                      ? const SizedBox(height: 20, width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Soumettre pour vérification'),
                ),
              ],
            ),
    );
  }

  Widget _banner(String kyc) {
    final color = switch (kyc) {
      'approved' => NewdemColors.cash,
      'rejected' => NewdemColors.accent,
      'submitted' => NewdemColors.teal,
      _ => NewdemColors.muted,
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(.4)),
      ),
      child: Row(children: [
        Icon(Icons.verified_user_outlined, color: color),
        const SizedBox(width: 10),
        Expanded(child: Text('Statut : ${_statusLabels[kyc] ?? kyc}',
            style: TextStyle(fontWeight: FontWeight.w600, color: color))),
      ]),
    );
  }

  Widget _docTile(Map<String, dynamic> d) {
    final kind = d['kind'] as String;
    final uploaded = d['uploaded'] as bool? ?? false;
    final verified = d['verified'] as bool? ?? false;
    final busy = _busyKind == kind;

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        verified ? Icons.check_circle : (uploaded ? Icons.description : Icons.upload_file),
        color: verified ? NewdemColors.cash : (uploaded ? NewdemColors.teal : NewdemColors.muted),
      ),
      title: Text(_docLabels[kind] ?? kind),
      subtitle: Text(verified ? 'Vérifiée' : (uploaded ? 'Envoyée' : 'Non fournie'),
          style: const TextStyle(fontSize: 12)),
      trailing: busy
          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : TextButton(
              onPressed: () => _pickAndUpload(kind),
              child: Text(uploaded ? 'Remplacer' : 'Téléverser'),
            ),
    );
  }
}
